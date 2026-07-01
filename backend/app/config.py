import os
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./hookshield.db"

    # SMTP Mailer Settings
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "noreply@hookshield.io"

    # JWT Authentication
    JWT_SECRET: str = "supersecret_linear_theme_key_change_me_in_production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours

    # GCP Cloud Tasks (Used in production)
    GCP_PROJECT_ID: str = "mock-project-id"
    GCP_LOCATION: str = "us-central1"
    GCP_QUEUE_ID: str = "hookshield-retry-queue"
    GCP_SERVICE_ACCOUNT_EMAIL: str = "hookshield-worker@mock-project.iam.gserviceaccount.com"

    # Worker Settings
    WORKER_URL: str = "http://localhost:8000/worker/process"
    USE_LOCAL_QUEUE: bool = True

    # Retry parameters
    INITIAL_BACKOFF_BASE: int = 2  # Base delay in seconds
    MAX_RETRIES: int = 10
    CIRCUIT_BREAKER_LIMIT: int = 50

settings = Settings()
