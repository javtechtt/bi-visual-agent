"""Pydantic models mirroring the TypeScript Zod schemas for cross-service contracts."""

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class ConfidenceLevel(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class ConfidenceScore(BaseModel):
    level: ConfidenceLevel
    score: float = Field(ge=0.0, le=1.0)
    reasoning: str = Field(min_length=1)


class ColumnProfile(BaseModel):
    name: str
    dtype: str
    null_count: int = Field(ge=0)
    unique_count: int = Field(ge=0)
    sample_values: list[Any] = Field(max_length=5)
    semantic_type: str | None = None


class DataProfile(BaseModel):
    dataset_id: str
    row_count: int = Field(ge=0)
    column_count: int = Field(gt=0)
    columns: list[ColumnProfile]
    quality_score: float = Field(ge=0.0, le=1.0)
    issues: list[dict[str, Any]] = Field(default_factory=list)


class AnalysisAction(str, Enum):
    KPI = "kpi"
    TREND = "trend"
    CORRELATION = "correlation"
    ANOMALY = "anomaly"
    FORECAST = "forecast"
    SEGMENT = "segment"
    ALL = "all"


class AnalysisRequest(BaseModel):
    session_id: str
    dataset_id: str
    action: AnalysisAction
    parameters: dict[str, Any] = Field(default_factory=dict)


class Insight(BaseModel):
    title: str
    description: str
    confidence: ConfidenceScore
    visualization: dict[str, Any] | None = None
    supporting_data: dict[str, Any] | None = None


class AnalysisMetadata(BaseModel):
    processing_time_ms: float = Field(ge=0)
    rows_analyzed: int = Field(ge=0)
    methodology: str


class AnalysisResponse(BaseModel):
    session_id: str
    dataset_id: str
    insights: list[Insight]
    metadata: AnalysisMetadata


class ProfileRequest(BaseModel):
    dataset_id: str
    file_path: str
    sample_size: int = Field(default=10000, gt=0, le=100000)
