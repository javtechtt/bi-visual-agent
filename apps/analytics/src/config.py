from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Analytics service configuration."""

    host: str = "0.0.0.0"
    port: int = 8100
    debug: bool = False
    log_level: str = "info"

    database_url: str = "postgresql://bi_user:bi_pass@localhost:5432/bi_platform"
    redis_url: str = "redis://localhost:6379"

    max_dataset_rows: int = 10_000_000
    max_query_timeout_seconds: int = 30

    model_config = {"env_prefix": "ANALYTICS_", "env_file": ".env"}


settings = Settings()
