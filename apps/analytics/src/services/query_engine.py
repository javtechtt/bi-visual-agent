"""DuckDB-backed query engine for dataset analysis."""

import time

import duckdb

from ..config import settings


class QueryEngine:
    """Execute SQL queries against datasets using DuckDB."""

    def __init__(self) -> None:
        self._conn = duckdb.connect()

    def execute(
        self,
        sql: str,
        *,
        limit: int = 1000,
    ) -> dict:
        """Execute a SQL query and return structured results."""
        start = time.perf_counter()

        limited_sql = f"SELECT * FROM ({sql}) AS q LIMIT {limit}"
        result = self._conn.execute(limited_sql)
        columns = [
            {"name": desc[0], "type": desc[1]} for desc in (result.description or [])
        ]
        rows = result.fetchall()
        elapsed_ms = (time.perf_counter() - start) * 1000

        return {
            "columns": columns,
            "rows": rows,
            "row_count": len(rows),
            "execution_time_ms": round(elapsed_ms, 2),
            "truncated": len(rows) >= limit,
        }

    def register_dataset(self, dataset_id: str, file_path: str) -> None:
        """Register a file as a named table in DuckDB."""
        self._conn.execute(
            f"CREATE OR REPLACE TABLE \"{dataset_id}\" AS SELECT * FROM read_csv_auto('{file_path}')"
        )

    def close(self) -> None:
        self._conn.close()


# Singleton
_ = settings  # ensure settings are loaded
query_engine = QueryEngine()
