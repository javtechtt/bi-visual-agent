"""Analysis endpoints — called by the Node.js API/worker services."""

import io
import logging
import math
import re
from datetime import date, datetime, time

import polars as pl
from fastapi import APIRouter, HTTPException, UploadFile, File, Form

from ..models.schemas import (
    AnalysisRequest,
    AnalysisResponse,
    DataProfile,
    ColumnProfile,
)
from ..services.statistical import statistical_service

logger = logging.getLogger("bi_analytics.analysis")

router = APIRouter(prefix="/api/v1")

# In-memory cache of loaded DataFrames (keyed by dataset_id).
# Populated by /profile, consumed by /analyze.
_dataset_cache: dict[str, pl.DataFrame] = {}


# ─── Analyze ─────────────────────────────────────────────────


@router.post("/analyze", response_model=AnalysisResponse)
async def analyze(request: AnalysisRequest) -> AnalysisResponse:
    """Run real statistical analysis on a dataset."""
    file_path = request.parameters.get("file_path")

    # Try cache first, then load from file_path
    df = _dataset_cache.get(request.dataset_id)
    if df is None:
        if not file_path or not isinstance(file_path, str):
            raise HTTPException(
                status_code=400,
                detail=f"Dataset {request.dataset_id} not in cache. Provide file_path in parameters.",
            )
        try:
            df = _read_file(file_path)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to read dataset: {e}") from e
        _dataset_cache[request.dataset_id] = df

    return statistical_service.run_analysis(
        df,
        session_id=request.session_id,
        dataset_id=request.dataset_id,
        action=request.action.value,
        parameters=request.parameters,
    )


# ─── Profile ─────────────────────────────────────────────────


@router.post("/profile", response_model=DataProfile)
async def profile_dataset(
    file: UploadFile = File(...),
    dataset_id: str = Form(...),
    sample_size: int = Form(default=10000),
) -> DataProfile:
    """Profile an uploaded file (CSV or Excel). Caches the DataFrame for subsequent analysis."""
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    filename = (file.filename or "").lower()
    is_excel = filename.endswith((".xlsx", ".xls")) or (
        file.content_type is not None and "spreadsheet" in file.content_type
    )
    is_pdf = filename.endswith(".pdf") or (
        file.content_type is not None and file.content_type == "application/pdf"
    )

    if is_pdf:
        file_type = "PDF"
    elif is_excel:
        file_type = "Excel"
    else:
        file_type = "CSV"

    logger.info("Profile request: dataset_id=%s filename=%s type=%s", dataset_id, filename, file_type)

    try:
        if is_pdf:
            df = _parse_pdf(content)
        elif is_excel:
            df = _parse_excel(content, sample_size)
        else:
            df = pl.read_csv(io.BytesIO(content), n_rows=sample_size)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to parse %s file %s: %s", file_type, filename, e)
        raise HTTPException(status_code=400, detail=f"Failed to parse {file_type} file: {e}") from e

    if len(df.columns) == 0 or len(df) == 0:
        raise HTTPException(
            status_code=400,
            detail=f"No tabular data found in {file_type} file. "
            "The file may have empty sheets, merged cells, or non-tabular content.",
        )

    logger.info("Parsed %s: %d rows x %d columns", file_type, len(df), len(df.columns))

    # Cache for /analyze calls
    _dataset_cache[dataset_id] = df

    columns: list[ColumnProfile] = []
    issues: list[dict[str, str]] = []

    for col_name in df.columns:
        col = df[col_name]
        null_count = int(col.null_count())
        row_count = len(df)

        semantic_type = _infer_semantic_type(col_name, str(col.dtype))

        # Sanitize sample values — Excel columns parsed via pandas can contain
        # float NaN (for missing ints), Timestamps, etc. that are not JSON-safe.
        raw_samples = col.drop_nulls().head(5).to_list()
        safe_samples = _sanitize_sample_values(raw_samples)

        columns.append(
            ColumnProfile(
                name=col_name,
                dtype=str(col.dtype),
                null_count=null_count,
                unique_count=int(col.n_unique()),
                sample_values=safe_samples,
                semantic_type=semantic_type,
            )
        )

        if row_count > 0 and null_count / row_count > 0.5:
            issues.append({
                "severity": "warning",
                "column": col_name,
                "message": f"{null_count}/{row_count} values are null ({null_count * 100 // row_count}%)",
            })

        if int(col.n_unique()) == 1 and row_count > 1:
            issues.append({
                "severity": "info",
                "column": col_name,
                "message": "Column has a single unique value",
            })

    total_cells = max(len(df) * len(df.columns), 1)
    total_nulls = sum(c.null_count for c in columns)
    quality_score = round(1.0 - (total_nulls / total_cells), 4)

    logger.info(
        "Profile complete: dataset_id=%s quality=%.4f issues=%d",
        dataset_id, quality_score, len(issues),
    )

    return DataProfile(
        dataset_id=dataset_id,
        row_count=len(df),
        column_count=len(df.columns),
        columns=columns,
        quality_score=quality_score,
        issues=issues,
    )


def _parse_excel(content: bytes, sample_size: int) -> pl.DataFrame:
    """Parse an Excel file, trying multiple sheets and header positions.

    Real-world business Excel files often have:
    - Row 1 empty, row 2 a merged title, row 3 actual headers
    - Cover/title sheets with no tabular data
    - Merged cells that produce 'Unnamed:*' columns
    - Column A entirely empty (data starts in B)
    - Repeated header rows mid-data

    Strategy: for each sheet, try skiprows 0..10. Score each attempt on
    (named_columns, data_rows). Pick the attempt with the most named columns;
    break ties by row count. This ensures we find the real header row even
    when skip=0 produces a larger but unnamed-column result.
    """
    import pandas as pd

    buf = io.BytesIO(content)
    xls = pd.ExcelFile(buf)
    sheet_names = xls.sheet_names
    logger.info("Excel file has %d sheet(s): %s", len(sheet_names), sheet_names)

    best_df: pd.DataFrame | None = None
    best_score: tuple[int, int] = (0, 0)  # (named_cols, data_rows)

    for sheet in sheet_names:
        for skip in (0, 1, 2, 3, 4, 5, 8, 10, 15):
            try:
                pdf = pd.read_excel(
                    xls, sheet_name=sheet, skiprows=skip, nrows=sample_size,
                )
            except Exception:
                continue

            # Drop columns that are entirely empty (merged-cell artifacts)
            pdf = pdf.dropna(axis=1, how="all")
            # Drop rows that are entirely empty
            pdf = pdf.dropna(axis=0, how="all")

            if pdf.shape[1] < 2 or pdf.shape[0] < 1:
                continue

            named_cols = sum(
                1 for c in pdf.columns
                if not str(c).startswith("Unnamed:")
            )
            score = (named_cols, pdf.shape[0])

            if score > best_score:
                best_df = pdf
                best_score = score
                logger.info(
                    "  sheet=%r skip=%d → %d rows x %d cols "
                    "(%d named) — new best",
                    sheet, skip, pdf.shape[0], pdf.shape[1], named_cols,
                )

                # Perfect: all columns named and plenty of rows — stop early
                if named_cols == pdf.shape[1] and pdf.shape[0] >= 3:
                    break

        # If we already have a good result, no need to try more sheets
        if best_score[0] >= 2 and best_score[1] >= 3:
            break

    if best_df is None or best_df.empty:
        raise HTTPException(
            status_code=400,
            detail="No tabular data found in any Excel sheet. "
            "The file may only contain charts, images, or merged cells.",
        )

    # Clean up: remove rows that duplicate the header (common in multi-page
    # Excel layouts where headers repeat every N rows)
    header_vals = [str(c) for c in best_df.columns]
    mask = best_df.apply(
        lambda row: list(str(v) for v in row) == header_vals, axis=1,
    )
    if mask.any():
        logger.info("Removing %d repeated header row(s)", int(mask.sum()))
        best_df = best_df[~mask].reset_index(drop=True)

    # Drop rows where most columns are null — catches footer/signature rows
    # that have a label in one column but nothing else.
    threshold = max(best_df.shape[1] // 2, 2)
    best_df = best_df.dropna(thresh=threshold).reset_index(drop=True)

    # Coerce columns to proper numeric types where possible.
    # After removing repeated header rows, columns that were 'object' because
    # of a stray string may now be cleanly numeric.
    for col in best_df.columns:
        if best_df[col].dtype == object:
            converted = pd.to_numeric(best_df[col], errors="coerce")
            # Accept conversion if at least half the non-null values survived
            non_null_before = best_df[col].notna().sum()
            non_null_after = converted.notna().sum()
            if non_null_before > 0 and non_null_after / non_null_before >= 0.5:
                best_df[col] = converted

    # Convert pandas nullable dtypes to numpy so pl.from_pandas works
    # without pyarrow. Use float64 when NaNs are present (can't use int64).
    for col in best_df.columns:
        if hasattr(best_df[col].dtype, "numpy_dtype"):
            if best_df[col].isna().any():
                best_df[col] = best_df[col].astype("float64")
            else:
                best_df[col] = best_df[col].astype(best_df[col].dtype.numpy_dtype)

    logger.info(
        "Final Excel result: %d rows x %d cols, dtypes: %s",
        best_df.shape[0], best_df.shape[1],
        dict(best_df.dtypes),
    )

    return pl.from_pandas(best_df)


# ─── PDF Parsing (Phase 1: text-based tables only) ──────


def _parse_pdf(content: bytes) -> pl.DataFrame:
    """Extract the best table from a text-based PDF using word positions.

    Strategy (tuned for financial statements and reports):
    1. For each page, extract words with x/y coordinates via pdfplumber.
    2. Identify numeric column positions by clustering x-coords of number words.
    3. For each text line, separate the label (left) from values (right columns).
    4. Reconstruct split numbers (e.g. '1' + ',400' → '1,400') using proximity.
    5. Pick the page whose table has the most data rows.
    6. Detect year-header rows (e.g. '2023  2022') and use them as column names.

    Does NOT handle scanned/image PDFs — only text-layer content.
    """
    import pdfplumber
    import pandas as pd
    from collections import defaultdict

    try:
        pdf = pdfplumber.open(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(
            status_code=400, detail=f"Cannot open PDF: {e}",
        ) from e

    logger.info("PDF has %d page(s)", len(pdf.pages))

    # First try: pdfplumber's native table extraction with text strategy.
    # This works well for PDFs that have explicit or semi-explicit table grids.
    best_native = _pdf_try_native_tables(pdf)

    # Second try: word-position parser for financial-style PDFs where text
    # alignment defines columns (no visible grid lines).
    best_positional = _pdf_try_positional(pdf)

    pdf.close()

    # Pick whichever produced more usable rows
    candidates = []
    if best_native is not None and len(best_native) >= 3:
        candidates.append(("native", best_native))
    if best_positional is not None and len(best_positional) >= 3:
        candidates.append(("positional", best_positional))

    if not candidates:
        raise HTTPException(
            status_code=400,
            detail="No tabular data detected in PDF. "
            "The file may be scanned/image-based (OCR not supported yet), "
            "or does not contain structured tables.",
        )

    # Score: prefer tables with real column names and numeric data.
    # Native text-strategy tables often produce fragmented word columns
    # that look large but contain no usable tabular data.
    def _score(df: pd.DataFrame) -> tuple[int, int, int]:
        named = sum(1 for c in df.columns if not str(c).startswith("Col_"))
        numeric = sum(1 for c in df.columns if df[c].dtype in ("float64", "int64", "Float64", "Int64"))
        return (numeric, named, len(df))

    method, best_df = max(candidates, key=lambda x: _score(x[1]))
    logger.info(
        "PDF best table via %s: %d rows x %d cols",
        method, len(best_df), len(best_df.columns),
    )

    # Coerce numeric columns and convert nullable dtypes
    for col in best_df.columns:
        if best_df[col].dtype == object:
            converted = pd.to_numeric(best_df[col], errors="coerce")
            if converted.notna().sum() > best_df[col].notna().sum() * 0.3:
                best_df[col] = converted

    # Convert pandas nullable dtypes to numpy so pl.from_pandas works
    # without pyarrow. Use float64 when NaNs are present (can't use int64).
    for col in best_df.columns:
        if hasattr(best_df[col].dtype, "numpy_dtype"):
            if best_df[col].isna().any():
                best_df[col] = best_df[col].astype("float64")
            else:
                best_df[col] = best_df[col].astype(best_df[col].dtype.numpy_dtype)

    return pl.from_pandas(best_df)


def _pdf_try_native_tables(pdf: object) -> "pd.DataFrame | None":
    """Try pdfplumber's built-in table extraction with text strategy."""
    import pdfplumber  # noqa: F811
    import pandas as pd

    settings = {"vertical_strategy": "text", "horizontal_strategy": "text"}
    best_df: pd.DataFrame | None = None
    best_score = 0

    for i, page in enumerate(pdf.pages):  # type: ignore[union-attr]
        try:
            tables = page.extract_tables(table_settings=settings)
        except Exception:
            continue
        for table in tables:
            if not table or len(table) < 3:
                continue
            cols = max(len(r) for r in table)
            if cols < 2:
                continue

            # Normalize to equal-length rows
            rows = [r + [None] * (cols - len(r)) for r in table]

            # Score: penalize empty cells and fragmented columns (Unnamed-like)
            total = len(rows) * cols
            empty = sum(
                1 for r in rows for c in r
                if c is None or str(c).strip() == ""
            )
            filled_pct = 1 - empty / max(total, 1)

            # Reject tables that are mostly empty (text-strategy artifacts)
            if filled_pct < 0.25:
                continue

            score = len(rows) * cols * filled_pct
            if score > best_score:
                best_score = score
                # Use first non-empty row as header
                header_idx = 0
                for hi, row in enumerate(rows):
                    if sum(1 for c in row if c and str(c).strip()) >= 2:
                        header_idx = hi
                        break
                header = [
                    str(c).strip() if c and str(c).strip() else f"Col_{j+1}"
                    for j, c in enumerate(rows[header_idx])
                ]
                data_rows = rows[header_idx + 1:]
                best_df = pd.DataFrame(data_rows, columns=header)
                logger.info(
                    "  PDF native: page %d, %d rows x %d cols, fill=%.0f%%",
                    i + 1, len(data_rows), cols, filled_pct * 100,
                )

    if best_df is not None:
        # Drop all-empty rows and columns
        best_df = best_df.dropna(axis=1, how="all").dropna(axis=0, how="all")
        # Drop rows where most cells are empty
        thresh = max(best_df.shape[1] // 2, 2)
        best_df = best_df.dropna(thresh=thresh).reset_index(drop=True)

    return best_df


def _pdf_try_positional(pdf: object) -> "pd.DataFrame | None":
    """Parse tables using word x/y positions — best for financial statements
    where text alignment defines columns with no visible grid."""
    import pandas as pd
    from collections import defaultdict

    page_results: list[pd.DataFrame] = []

    for page_idx, page in enumerate(pdf.pages):  # type: ignore[union-attr]
        words = page.extract_words(x_tolerance=2, y_tolerance=2)
        if not words:
            continue

        # Group words into lines by y-position
        lines: dict[int, list[dict]] = defaultdict(list)  # type: ignore[arg-type]
        for w in words:
            y_key = round(float(w["top"]) / 3) * 3
            lines[y_key].append(w)
        for y in lines:
            lines[y].sort(key=lambda w: float(w["x0"]))

        page_width = float(page.width)
        mid_x = page_width * 0.50

        # Collect x-positions of numeric words in the right half of the page
        num_x: list[float] = []
        for y, ws in lines.items():
            for w in ws:
                if float(w["x0"]) > mid_x and re.match(
                    r'^[\d,\.\(\)\-]+$', w["text"].strip(),
                ):
                    num_x.append(float(w["x0"]))

        if len(num_x) < 4:
            continue

        # Cluster x-positions into columns (gap > 20px = new column)
        num_x.sort()
        clusters: list[list[float]] = [[num_x[0]]]
        for x in num_x[1:]:
            if x - clusters[-1][-1] < 20:
                clusters[-1].append(x)
            else:
                clusters.append([x])

        col_centers = [
            sum(c) / len(c) for c in clusters if len(c) >= 3
        ]
        if not col_centers:
            continue

        col_ranges = [(c - 30, c + 30) for c in col_centers]

        # Parse each line into label + column values
        rows: list[dict] = []
        for y, ws in sorted(lines.items()):
            label_parts: list[str] = []
            col_values: list[str | None] = [None] * len(col_ranges)

            for w in ws:
                x = float(w["x0"])
                text = w["text"].strip()
                matched = None
                for ci, (lo, hi) in enumerate(col_ranges):
                    if lo <= x <= hi:
                        matched = ci
                        break
                if matched is not None:
                    existing = col_values[matched] or ""
                    col_values[matched] = existing + text
                elif x < mid_x:
                    label_parts.append(text)

            label = " ".join(label_parts).strip()
            parsed: list[float | None] = []
            for v in col_values:
                if v is None or v.strip() in ("", "-"):
                    parsed.append(None)
                else:
                    v = v.strip()
                    neg = v.startswith("(") and v.endswith(")")
                    if neg:
                        v = v[1:-1]
                    v = v.replace(",", "").replace(" ", "")
                    try:
                        num = float(v)
                        parsed.append(-num if neg else num)
                    except ValueError:
                        parsed.append(None)

            if label and any(p is not None for p in parsed):
                row_dict: dict = {"Item": label}
                for ci, val in enumerate(parsed):
                    row_dict[f"Col_{ci + 1}"] = val
                rows.append(row_dict)

        if len(rows) < 3:
            continue

        df = pd.DataFrame(rows)

        # Detect year-header rows (values like 2020–2099) and rename columns
        def _is_year(v: object) -> bool:
            return (
                v is not None
                and isinstance(v, (int, float))
                and not math.isnan(v)
                and 2000 <= v <= 2099
            )

        for idx in range(min(3, len(df))):
            vals = [
                df.iloc[idx].get(f"Col_{i + 1}")
                for i in range(len(col_centers))
            ]
            if any(_is_year(v) for v in vals):
                new_names: dict[str, str] = {"Item": "Item"}
                for ci, v in enumerate(vals):
                    key = f"Col_{ci + 1}"
                    new_names[key] = str(int(v)) if _is_year(v) else key
                df = df.iloc[idx + 1 :].reset_index(drop=True)
                df = df.rename(columns=new_names)
                break

        page_results.append(df)
        logger.info(
            "  PDF positional: page %d → %d rows x %d cols",
            page_idx + 1, len(df), len(df.columns),
        )

    if not page_results:
        return None

    # Pick the table with the most data rows
    return max(page_results, key=len)


def _sanitize_value(v: object) -> object:
    """Make a single value JSON-safe. Handles NaN, NaT, Timestamps, etc."""
    if v is None:
        return None
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return None
    # pandas Timestamps / python datetimes → ISO string
    if isinstance(v, datetime):
        return v.isoformat()
    if isinstance(v, date):
        return v.isoformat()
    if isinstance(v, time):
        return v.isoformat()
    return v


def _sanitize_sample_values(values: list[object]) -> list[object]:
    """Sanitize a list of sample values so they survive JSON serialization."""
    return [_sanitize_value(v) for v in values]


def _read_file(path: str) -> pl.DataFrame:
    """Read a CSV, Excel, or PDF file into a Polars DataFrame."""
    lower = path.lower()
    if lower.endswith(".pdf"):
        with open(path, "rb") as f:
            return _parse_pdf(f.read())
    if lower.endswith((".xlsx", ".xls")):
        with open(path, "rb") as f:
            return _parse_excel(f.read(), sample_size=10_000_000)
    return pl.read_csv(path)


# ─── Parse Excel (raw data) ────────────────────────────────


@router.post("/parse-excel")
async def parse_excel(
    file: UploadFile = File(...),
) -> dict:
    """Parse an Excel file and return structured rows + columns."""
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    filename = (file.filename or "").lower()
    if not filename.endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Expected an Excel file (.xlsx or .xls)")

    try:
        df = _parse_excel(content, sample_size=100_000)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse Excel file: {e}") from e

    columns = df.columns
    rows = [
        {k: _sanitize_value(v) for k, v in row.items()}
        for row in df.to_dicts()
    ]

    return {
        "columns": columns,
        "rows": rows,
        "rowCount": len(rows),
    }


def _infer_semantic_type(col_name: str, dtype: str) -> str | None:
    name = col_name.lower().strip()
    date_hints = {"date", "time", "timestamp", "created", "updated", "dt", "day", "month", "year"}
    if any(h in name for h in date_hints) or "date" in dtype.lower() or "time" in dtype.lower():
        return "datetime"
    id_hints = {"id", "uuid", "key", "code", "sku"}
    if any(name == h or name.endswith(f"_{h}") for h in id_hints):
        return "identifier"
    money_hints = {"price", "cost", "revenue", "amount", "salary", "fee", "total", "profit", "margin"}
    if any(h in name for h in money_hints):
        return "monetary"
    pct_hints = {"rate", "ratio", "percent", "pct", "share"}
    if any(h in name for h in pct_hints):
        return "percentage"
    if "email" in name:
        return "email"
    if "name" in name or "label" in name or "title" in name:
        return "text_label"
    if "count" in name or "qty" in name or "quantity" in name:
        return "count"
    return None
