"""Statistical analysis service using Polars and SciPy."""

import time
from typing import Any

import numpy as np
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

    # ─── KPI Computation ─────────────────────────────────────

    def compute_kpis(self, df: pl.DataFrame) -> list[Insight]:
        """Auto-detect numeric columns and compute KPIs."""
        insights: list[Insight] = []
        numeric_cols = [c for c in df.columns if df[c].dtype.is_numeric()]

        if not numeric_cols:
            return [Insight(
                title="No Numeric Data",
                description="Dataset contains no numeric columns for KPI computation.",
                confidence=self.make_confidence(0.3, "No numeric data available"),
            )]

        for col_name in numeric_cols:
            col = df[col_name].drop_nulls()
            if len(col) == 0:
                continue

            values = col.to_numpy().astype(float)
            total = float(np.sum(values))
            mean = float(np.mean(values))
            median = float(np.median(values))
            std = float(np.std(values, ddof=1)) if len(values) > 1 else 0.0
            min_val = float(np.min(values))
            max_val = float(np.max(values))
            count = len(values)

            # Coefficient of variation → stability measure
            cv = std / abs(mean) if mean != 0 else 0.0
            stability = "stable" if cv < 0.3 else "moderate variance" if cv < 0.7 else "high variance"

            # Confidence based on sample size and variance
            size_factor = min(count / 30, 1.0)  # 30+ samples → full confidence from size
            variance_factor = max(1.0 - cv, 0.2)
            conf_score = round(size_factor * 0.6 + variance_factor * 0.4, 3)

            insights.append(Insight(
                title=f"{_humanize(col_name)} Summary",
                description=(
                    f"Total: {_fmt(total)} | Mean: {_fmt(mean)} | Median: {_fmt(median)} | "
                    f"Range: {_fmt(min_val)} – {_fmt(max_val)} | Distribution is {stability}."
                ),
                confidence=self.make_confidence(
                    conf_score,
                    f"{count} data points, CV={cv:.2f} ({stability})",
                ),
                visualization={
                    "chartType": "kpi_card",
                    "title": _humanize(col_name),
                    "data": [{
                        "metric": col_name,
                        "total": round(total, 2),
                        "mean": round(mean, 2),
                        "median": round(median, 2),
                        "min": round(min_val, 2),
                        "max": round(max_val, 2),
                        "std": round(std, 2),
                        "count": count,
                    }],
                },
            ))

        return insights

    # ─── Anomaly Detection ───────────────────────────────────

    def detect_anomalies(self, df: pl.DataFrame, *, threshold: float = 2.5) -> list[Insight]:
        """Detect anomalies across all numeric columns using z-score + IQR."""
        numeric_cols = [c for c in df.columns if df[c].dtype.is_numeric()]
        all_anomalies: list[dict[str, Any]] = []

        for col_name in numeric_cols:
            col = df[col_name].drop_nulls()
            values = col.to_numpy().astype(float)
            if len(values) < 5:
                continue

            # Z-score method
            z_scores = stats.zscore(values)
            # IQR method
            q1, q3 = float(np.percentile(values, 25)), float(np.percentile(values, 75))
            iqr = q3 - q1
            iqr_low, iqr_high = q1 - 1.5 * iqr, q3 + 1.5 * iqr

            for i, (z, val) in enumerate(zip(z_scores, values)):
                is_zscore_anomaly = abs(z) > threshold
                is_iqr_anomaly = val < iqr_low or val > iqr_high

                if is_zscore_anomaly or is_iqr_anomaly:
                    methods = []
                    if is_zscore_anomaly:
                        methods.append(f"z-score={abs(z):.2f}")
                    if is_iqr_anomaly:
                        methods.append("outside IQR")

                    all_anomalies.append({
                        "row": int(i),
                        "column": col_name,
                        "value": round(float(val), 4),
                        "methods": methods,
                        "z_score": round(float(abs(z)), 2),
                    })

        if not all_anomalies:
            return [Insight(
                title="No Anomalies Detected",
                description=f"Checked {len(numeric_cols)} numeric columns with z-score (>{threshold}) and IQR methods. No statistical outliers found.",
                confidence=self.make_confidence(
                    min(0.5 + len(df) / 200, 0.95),
                    f"Analyzed {len(df)} rows across {len(numeric_cols)} columns",
                ),
            )]

        # Group by column
        by_col: dict[str, list[dict[str, Any]]] = {}
        for a in all_anomalies:
            by_col.setdefault(a["column"], []).append(a)

        insights: list[Insight] = []
        for col_name, anomalies in by_col.items():
            col_vals = df[col_name].drop_nulls().to_numpy().astype(float)
            anomaly_rate = len(anomalies) / len(col_vals)

            insights.append(Insight(
                title=f"Anomalies in {_humanize(col_name)}",
                description=(
                    f"Found {len(anomalies)} outlier{'s' if len(anomalies) != 1 else ''} "
                    f"out of {len(col_vals)} values ({anomaly_rate:.1%}). "
                    f"Values: {', '.join(str(a['value']) for a in anomalies[:5])}"
                    f"{'...' if len(anomalies) > 5 else ''}."
                ),
                confidence=self.make_confidence(
                    min(0.6 + len(col_vals) / 100, 0.95),
                    f"Dual-method detection (z-score + IQR) on {len(col_vals)} values",
                ),
                visualization={
                    "chartType": "bar",
                    "title": f"Anomalies: {_humanize(col_name)}",
                    "data": [{"value": a["value"], "z_score": a["z_score"], "row": a["row"]} for a in anomalies[:20]],
                    "xAxis": "row",
                    "yAxis": "value",
                },
                supporting_data={"anomalies": anomalies[:50], "total": len(anomalies)},
            ))

        return insights

    # ─── Trend Detection ─────────────────────────────────────

    def detect_trends(self, df: pl.DataFrame) -> list[Insight]:
        """Detect trends if a date-like column exists alongside numeric columns."""
        # Find a date column
        date_col = None
        for c in df.columns:
            name = c.lower()
            if any(h in name for h in ("date", "time", "timestamp", "dt", "day")):
                date_col = c
                break
            if df[c].dtype in (pl.Date, pl.Datetime):
                date_col = c
                break

        if date_col is None:
            return [Insight(
                title="No Time Series Data",
                description="No date or timestamp column detected. Trend analysis requires temporal data.",
                confidence=self.make_confidence(0.4, "No date column found in dataset"),
            )]

        numeric_cols = [c for c in df.columns if df[c].dtype.is_numeric() and c != date_col]
        if not numeric_cols:
            return []

        # Sort by date and create numeric index
        try:
            sorted_df = df.sort(date_col)
        except Exception:
            sorted_df = df

        insights: list[Insight] = []
        for col_name in numeric_cols:
            col = sorted_df[col_name].drop_nulls()
            values = col.to_numpy().astype(float)
            if len(values) < 3:
                continue

            x = np.arange(len(values), dtype=float)
            slope, intercept, r_value, p_value, std_err = stats.linregress(x, values)
            r_squared = r_value ** 2

            # Direction
            if abs(slope) < std_err:
                direction = "stable"
            elif slope > 0:
                direction = "increasing"
            else:
                direction = "decreasing"

            # Percent change from first to last predicted value
            first_pred = intercept
            last_pred = intercept + slope * (len(values) - 1)
            pct_change = ((last_pred - first_pred) / abs(first_pred) * 100) if first_pred != 0 else 0.0

            # Confidence from R² and p-value
            r2_factor = r_squared
            p_factor = 1.0 if p_value < 0.05 else 0.5 if p_value < 0.1 else 0.3
            conf_score = round(r2_factor * 0.7 + p_factor * 0.3, 3)

            trend_data = [
                {"index": int(i), "actual": round(float(v), 2), "trend": round(intercept + slope * i, 2)}
                for i, v in enumerate(values)
            ]

            insights.append(Insight(
                title=f"{_humanize(col_name)} Trend: {direction.title()}",
                description=(
                    f"Linear trend is {direction} ({pct_change:+.1f}% over the series). "
                    f"R²={r_squared:.3f}, p={p_value:.4f}. "
                    f"{'Statistically significant.' if p_value < 0.05 else 'Not statistically significant at p<0.05.'}"
                ),
                confidence=self.make_confidence(
                    conf_score,
                    f"R²={r_squared:.3f}, p-value={p_value:.4f}, n={len(values)}",
                ),
                visualization={
                    "chartType": "line",
                    "title": f"{_humanize(col_name)} Trend",
                    "data": trend_data,
                    "xAxis": "index",
                    "yAxis": "actual",
                },
                supporting_data={
                    "slope": round(slope, 6),
                    "intercept": round(intercept, 4),
                    "r_squared": round(r_squared, 4),
                    "p_value": round(p_value, 6),
                    "direction": direction,
                    "pct_change": round(pct_change, 2),
                },
            ))

        return insights

    # ─── Full Analysis ───────────────────────────────────────

    def run_analysis(
        self,
        df: pl.DataFrame,
        *,
        session_id: str,
        dataset_id: str,
        action: str,
        parameters: dict[str, Any],
    ) -> AnalysisResponse:
        """Dispatch to the correct analysis method and build the response."""
        start = time.perf_counter()
        insights: list[Insight] = []
        methods: list[str] = []

        if action == "kpi":
            insights = self.compute_kpis(df)
            methods.append("Summary statistics (mean, median, std, range)")
        elif action == "anomaly":
            threshold = float(parameters.get("threshold", 2.5))
            insights = self.detect_anomalies(df, threshold=threshold)
            methods.append(f"Z-score (threshold={threshold}) + IQR outlier detection")
        elif action == "trend":
            insights = self.detect_trends(df)
            methods.append("Linear regression trend analysis with significance testing")
        else:
            # Run all three for general analysis
            insights.extend(self.compute_kpis(df))
            insights.extend(self.detect_anomalies(df))
            insights.extend(self.detect_trends(df))
            methods.extend([
                "Summary statistics",
                "Z-score + IQR anomaly detection",
                "Linear regression trend analysis",
            ])

        return AnalysisResponse(
            session_id=session_id,
            dataset_id=dataset_id,
            insights=insights,
            metadata=AnalysisMetadata(
                processing_time_ms=round((time.perf_counter() - start) * 1000, 2),
                rows_analyzed=len(df),
                methodology=" | ".join(methods),
            ),
        )

    # ─── Helpers ─────────────────────────────────────────────

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
        score = max(0.0, min(1.0, score))
        if score >= 0.8:
            level = ConfidenceLevel.HIGH
        elif score >= 0.5:
            level = ConfidenceLevel.MEDIUM
        else:
            level = ConfidenceLevel.LOW
        return ConfidenceScore(level=level, score=round(score, 3), reasoning=reasoning)


def _humanize(col_name: str) -> str:
    """Convert column_name to Column Name."""
    return col_name.replace("_", " ").replace("-", " ").title()


def _fmt(val: float) -> str:
    """Format a number for display."""
    if abs(val) >= 1_000_000:
        return f"{val:,.0f}"
    if abs(val) >= 1:
        return f"{val:,.2f}"
    return f"{val:.4f}"


statistical_service = StatisticalService()
