from pydantic_settings import BaseSettings
from typing import List
import os


class Settings(BaseSettings):
    # App
    APP_NAME: str = "nexus-exchange"
    APP_ENV: str = "development"
    DEBUG: bool = True
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

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
