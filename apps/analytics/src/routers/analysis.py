"""Analysis endpoints — called by the Node.js API/worker services."""

import io

import polars as pl
from fastapi import APIRouter, HTTPException, UploadFile, File, Form

from ..models.schemas import (
    AnalysisRequest,
    AnalysisResponse,
    DataProfile,
    ColumnProfile,
)
from ..services.statistical import statistical_service

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
            df = pl.read_csv(file_path)
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
    """Profile an uploaded CSV file. Caches the DataFrame for subsequent analysis."""
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    try:
        df = pl.read_csv(io.BytesIO(content), n_rows=sample_size)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV: {e}") from e

    # Cache for /analyze calls
    _dataset_cache[dataset_id] = df

    columns: list[ColumnProfile] = []
    issues: list[dict[str, str]] = []

    for col_name in df.columns:
        col = df[col_name]
        null_count = int(col.null_count())
        row_count = len(df)

        semantic_type = _infer_semantic_type(col_name, str(col.dtype))

        columns.append(
            ColumnProfile(
                name=col_name,
                dtype=str(col.dtype),
                null_count=null_count,
                unique_count=int(col.n_unique()),
                sample_values=col.drop_nulls().head(5).to_list(),
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

    return DataProfile(
        dataset_id=dataset_id,
        row_count=len(df),
        column_count=len(df.columns),
        columns=columns,
        quality_score=quality_score,
        issues=issues,
    )


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
