"""Statistical analysis service using Polars and SciPy."""

import time
from typing import Any

import polars as pl
from scipy import stats

from ..models.schemas import (
    AnalysisMetadata,
    AnalysisResponse,
    ConfidenceLevel,
    ConfidenceScore,
    Insight,
)


class StatisticalService:
    """Core statistical analysis capabilities."""

    def compute_kpis(
        self,
        df: pl.DataFrame,
        metrics: list[str],
        *,
        group_by: str | None = None,
    ) -> list[dict[str, Any]]:
        """Compute summary KPIs for the given metrics."""
        results: list[dict[str, Any]] = []
        for metric in metrics:
            if metric not in df.columns:
                continue
            col = df[metric]
            if col.dtype.is_numeric():
                results.append({
                    "metric": metric,
                    "current_value": float(col.mean() or 0),
                    "min": float(col.min() or 0),
                    "max": float(col.max() or 0),
                    "std": float(col.std() or 0),
                })
        return results

    def detect_anomalies(
        self,
        df: pl.DataFrame,
        columns: list[str],
        *,
        threshold: float = 3.0,
    ) -> list[dict[str, Any]]:
        """Detect anomalies using z-score method."""
        anomalies: list[dict[str, Any]] = []
        for col_name in columns:
            if col_name not in df.columns:
                continue
            col = df[col_name]
            if not col.dtype.is_numeric():
                continue
            values = col.drop_nulls().to_numpy()
            if len(values) < 3:
                continue
            z_scores = stats.zscore(values)
            for i, (z, val) in enumerate(zip(z_scores, values)):
                if abs(z) > threshold:
                    anomalies.append({
                        "row_index": i,
                        "column": col_name,
                        "value": float(val),
                        "score": float(abs(z)),
                        "explanation": f"Z-score of {abs(z):.2f} exceeds threshold of {threshold}",
                    })
        return anomalies

    def build_response(
        self,
        *,
        session_id: str,
        dataset_id: str,
        insights: list[Insight],
        rows_analyzed: int,
        methodology: str,
        start_time: float,
    ) -> AnalysisResponse:
        elapsed = (time.perf_counter() - start_time) * 1000
        return AnalysisResponse(
            session_id=session_id,
            dataset_id=dataset_id,
            insights=insights,
            metadata=AnalysisMetadata(
                processing_time_ms=round(elapsed, 2),
                rows_analyzed=rows_analyzed,
                methodology=methodology,
            ),
        )

    @staticmethod
    def make_confidence(score: float, reasoning: str) -> ConfidenceScore:
        if score >= 0.8:
            level = ConfidenceLevel.HIGH
        elif score >= 0.5:
            level = ConfidenceLevel.MEDIUM
        else:
            level = ConfidenceLevel.LOW
        return ConfidenceScore(level=level, score=score, reasoning=reasoning)


statistical_service = StatisticalService()
