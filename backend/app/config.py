from pydantic_settings import BaseSettings
from typing import List
import os


class Settings(BaseSettings):
    # App
    APP_NAME: str = "nexus-exchange"
    APP_ENV: str = "production"
    DEBUG: bool = False
    SECRET_KEY: str = "change-me-to-a-random-64-char-string"

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://nexus:nexus_password@localhost:5432/nexus_exchange"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # JWT
    JWT_SECRET_KEY: str = "change-me-jwt-secret-key-min-32-chars"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    JWT_ALGORITHM: str = "HS256"

    # Admin JWT
    ADMIN_JWT_SECRET_KEY: str = "change-me-admin-jwt-secret-key"
    ADMIN_JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # Celery
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"

    # CORS
    CORS_ORIGINS: List[str] = ["http://localhost:3000"]

    # Wallet / Blockchain (Phase 2)
    ENABLE_BLOCKCHAIN_WALLET: bool = False
    ALCHEMY_API_KEY: str = ""
    TRON_API_KEY: str = ""

    # Rate Limiting
    RATE_LIMIT_PER_MINUTE: int = 60
    AUTH_RATE_LIMIT_PER_MINUTE: int = 10

    # Account Lockout
    MAX_LOGIN_ATTEMPTS: int = 5
    LOCKOUT_DURATION_MINUTES: int = 15

    # Allowed Origins for CSRF Origin check
    ALLOWED_ORIGINS: List[str] = ["http://localhost:3000"]

    # ── Withdrawal Safety ──
    WITHDRAWAL_DAILY_LIMIT_USDT: str = "50000"       # Max daily withdrawal per user (in USDT equivalent)
    WITHDRAWAL_PER_TX_MAX_USDT: str = "25000"         # Max single withdrawal
    WITHDRAWAL_MULTI_APPROVAL_THRESHOLD: str = "10000" # Require 2 admins above this
    WITHDRAWAL_MULTI_APPROVAL_COUNT: int = 2           # How many admins needed for large
    WITHDRAWAL_ADDRESS_COOLDOWN_HOURS: int = 24        # New address must wait before use
    WITHDRAWAL_VELOCITY_MAX_PER_HOUR: int = 3          # Max withdrawals per user per hour
    WITHDRAWAL_FEE_USDT: str = "1"                     # Flat fee (per asset config later)

    # ── Admin Self-Protection ──
    ADMIN_LARGE_CREDIT_THRESHOLD: str = "10000"        # Require 2nd admin above this

    # ── Alerting ──
    ALERT_WEBHOOK_URL: str = ""  # Slack/Discord webhook URL (empty = log only)

    # ── Seed Admin Passwords (initial setup only) ──
    SEED_ADMIN_PASSWORD: str = ""
    SEED_OPERATOR_PASSWORD: str = ""
    SEED_FINANCE_PASSWORD: str = ""
    SEED_VIEWER_PASSWORD: str = ""

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()
