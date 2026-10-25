"""
app/core/config.py
Central configuration loaded from environment variables.
All settings validated at startup — fail fast on misconfiguration.
"""
from functools import lru_cache
from typing import List

from pydantic import AnyHttpUrl, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── App ───────────────────────────────────────────────────────────────────
    APP_ENV: str = "development"
    APP_NAME: str = "MOXY"
    APP_VERSION: str = "1.0.0"
    SECRET_KEY: str
    DEBUG: bool = False

    # ── Database ──────────────────────────────────────────────────────────────
    DATABASE_URL: str
    DATABASE_POOL_SIZE: int = 10
    DATABASE_MAX_OVERFLOW: int = 20

    # ── Redis ─────────────────────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"

    # ── Supabase ──────────────────────────────────────────────────────────────
    SUPABASE_URL: str
    SUPABASE_ANON_KEY: str
    SUPABASE_SERVICE_ROLE_KEY: str
    SUPABASE_JWT_SECRET: str

    # ── CORS ──────────────────────────────────────────────────────────────────
    ALLOWED_ORIGINS: str = "http://localhost:5173"

    @property
    def cors_origins(self) -> List[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",")]

    # ── Rate Limiting ─────────────────────────────────────────────────────────
    RATE_LIMIT_PER_MINUTE: int = 300  # per IP; chat and live refetches add up fast
    RATE_LIMIT_BURST: int = 20

    # ── Email ─────────────────────────────────────────────────────────────────
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_REGION: str = "ap-south-1"
    FROM_EMAIL: str = "noreply@moxy.app"

    # ── Scheduler ─────────────────────────────────────────────────────────────
    # In-process loop that resets due tasks every minute. Safe to run in every
    # worker: due rows are claimed with FOR UPDATE SKIP LOCKED.
    # /internal/reset-due-tasks stays available for an external cron.
    ENABLE_SCHEDULER: bool = True
    SCHEDULER_INTERVAL_SECONDS: int = 60
    INTERNAL_CRON_SECRET: str = ""

    # How often (at most) a request bumps users.last_seen_at
    LAST_SEEN_THROTTLE_SECONDS: int = 300

    @property
    def is_production(self) -> bool:
        return self.APP_ENV == "production"


@lru_cache
def get_settings() -> Settings:
    """Cached settings — instantiated once per process."""
    return Settings()


settings = get_settings()
