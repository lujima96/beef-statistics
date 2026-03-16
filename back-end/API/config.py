from __future__ import annotations

from pathlib import Path
from pydantic import Field, AliasChoices, AnyHttpUrl
from pydantic_settings import BaseSettings, SettingsConfigDict


class Config(BaseSettings):
    """Application configuration loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[2] / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    pg_host: str = Field("localhost", alias="PGHOST")
    pg_port: int = Field(5432, validation_alias=AliasChoices("PGPORT", "PG_HOST_PORT"))
    postgres_db: str = Field("beef_data", alias="POSTGRES_DB")
    postgres_user: str = Field("postgres", alias="POSTGRES_USER")
    postgres_password: str = Field("", alias="POSTGRES_PASSWORD")

    # Bind to all interfaces by default so the API is reachable from LAN dev hosts.
    api_host: str = Field("0.0.0.0", alias="API_HOST")
    api_port: int = Field(8000, alias="API_PORT")

    graphhopper_base_url: AnyHttpUrl = Field(
        "http://127.0.0.1:8989", alias="GRAPHHOPPER_BASE_URL"
    )
    graphhopper_timeout: float = Field(10.0, alias="GRAPHHOPPER_TIMEOUT")

    delivery_estimator_span_cost_coefficient: int = Field(
        10,
        alias="DELIVERY_ESTIMATOR_SPAN_COST_COEFFICIENT",
        ge=0,
        description=(
            "Bias coefficient for equalizing vehicle route end times."
            " Set to 0 to disable."
        ),
    )

    feed_data_schema: str = Field("beef_data", alias="FEED_DATA_SCHEMA")
    feed_data_table: str = Field("feed_costs", alias="FEED_DATA_TABLE")

    @property
    def pg_dsn(self) -> str:
        return (
            f"postgresql://{self.postgres_user}:{self.postgres_password}"
            f"@{self.pg_host}:{self.pg_port}/{self.postgres_db}"
        )


config = Config()
