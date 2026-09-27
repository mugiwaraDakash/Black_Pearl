import os
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-flash-lite-latest"

    # Set to true to use SQLite instead of Postgres (no Docker needed)
    USE_SQLITE: bool = True
    SQLITE_DB_PATH: str = "/tmp/blackpearl.sqlite3" if os.getenv("VERCEL") or os.getenv("AWS_LAMBDA_FUNCTION_NAME") else "./blackpearl.sqlite3"

    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = "blackpearl"
    POSTGRES_USER: str = "blackpearl"
    POSTGRES_PASSWORD: str = "blackpearl"

    NEO4J_URI: str = "bolt://localhost:7687"
    NEO4J_USER: str = "neo4j"
    NEO4J_PASSWORD: str = "blackpearl123"

    LEDGER_DB_PATH: str = "/tmp/evidence_ledger.sqlite3" if os.getenv("VERCEL") or os.getenv("AWS_LAMBDA_FUNCTION_NAME") else "./evidence_ledger.sqlite3"

    GEO_API_BASE: str = "http://ip-api.com/json"

    @property
    def database_url(self) -> str:
        if self.USE_SQLITE:
            return f"sqlite:///{self.SQLITE_DB_PATH}"
        return (
            f"postgresql+psycopg2://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )


settings = Settings()
