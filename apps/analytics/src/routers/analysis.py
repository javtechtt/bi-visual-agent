"""Analysis endpoints — called by the Node.js API/worker services."""

import io
import time

from fastapi import APIRouter, HTTPException, UploadFile, File, Form

from ..models.schemas import (
    AnalysisRequest,
    AnalysisResponse,
    Insight,
    DataProfile,
    ColumnProfile,
)
from ..services.statistical import statistical_service

router = APIRouter(prefix="/api/v1")


@router.post("/analyze", response_model=AnalysisResponse)
async def analyze(request: AnalysisRequest) -> AnalysisResponse:
    """Run statistical analysis on a dataset."""
    start = time.perf_counter()

    placeholder_insight = Insight(
        title=f"{request.action.value.title()} Analysis",
        description=f"Analysis pending — dataset {request.dataset_id}",
        confidence=statistical_service.make_confidence(
            0.0, "Placeholder — dataset not yet loaded"
        ),
    )

    return statistical_service.build_response(
        session_id=request.session_id,
        dataset_id=request.dataset_id,
        insights=[placeholder_insight],
        rows_analyzed=0,
        methodology=f"{request.action.value} analysis via Python analytics service",
        start_time=start,
    )


@router.post("/profile", response_model=DataProfile)
async def profile_dataset(
    file: UploadFile = File(...),
    dataset_id: str = Form(...),
    sample_size: int = Form(default=10000),
) -> DataProfile:
    """Profile an uploaded CSV file. Accepts multipart/form-data."""
    import polars as pl

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    try:
        df = pl.read_csv(io.BytesIO(content), n_rows=sample_size)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV: {e}") from e

    columns: list[ColumnProfile] = []
    issues: list[dict[str, str]] = []

    for col_name in df.columns:
        col = df[col_name]
        null_count = int(col.null_count())
        row_count = len(df)

        # Detect semantic types
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

        # Flag quality issues
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
    """Basic heuristic semantic type detection from column name and dtype."""
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
