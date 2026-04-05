"""
Crypto4Pro — FastAPI Application Entry Point

Production-grade crypto exchange backend with:
- Double-entry ledger system
- Event-driven campaign reward engine
- JWT auth (separate user/admin)
- Real-time WebSocket market data
- Audit logging for all admin actions
"""

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings

# Sentry initialization (no-op if DSN not set)
_sentry_dsn = os.environ.get("SENTRY_DSN", "")
if _sentry_dsn:
    import sentry_sdk
    sentry_sdk.init(
        dsn=_sentry_dsn,
        traces_sample_rate=0.1,
        environment=settings.APP_ENV,
        send_default_pii=False,
    )
from app.database import engine, Base
from app.events.bus import EventBus
from app.middleware.request_logging import RequestLoggingMiddleware

logger = logging.getLogger("crypto4pro")

# Import routers
from app.api.auth import router as auth_router
from app.api.ledger import router as balance_router, ledger_router
from app.api.campaigns import router as campaign_router
from app.api.cms import router as cms_router
from app.api.market import router as market_router
from app.api.trading import router as trading_router

# Admin routers
from app.api.admin.auth import router as admin_auth_router
from app.api.admin.users import router as admin_users_router
from app.api.admin.campaigns import router as admin_campaigns_router
from app.api.admin.cms import router as admin_cms_router
from app.api.admin.flags import router as admin_flags_router
from app.api.admin.markets import router as admin_markets_router
from app.api.admin.logs import router as admin_logs_router
from app.api.admin.withdrawals import router as admin_withdrawals_router
from app.api.admin.reconciliation import router as admin_reconciliation_router
from app.api.admin.wallet import router as admin_wallet_router
from app.api.admin.orders import router as admin_orders_router
from app.api.admin.wallets_admin import router as admin_wallets_ops_router
from app.api.admin.kyc import router as admin_kyc_router

# User withdrawal + orders routers
from app.api.withdrawals import router as withdrawal_router
from app.api.orders import router as orders_router
from app.api.ws import router as ws_router
from app.api.wallet import router as wallet_router

# Webhooks
from app.api.webhooks.pay4pro import router as pay4pro_webhook_router

# User deposits + KYC
from app.api.deposits import router as deposits_router
from app.api.kyc import router as kyc_router
from app.services.market_data import get_market_data_service


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    # Startup
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    # Initialize event bus
    await EventBus.get_instance()
    
    # Start market data background polling
    market = get_market_data_service()
    await market.start_polling()
    
    yield
    
    # Shutdown
    await market.close()
    await EventBus.close()
    await engine.dispose()


# Disable interactive docs in production
_docs_url = "/docs" if settings.DEBUG else None
_redoc_url = "/redoc" if settings.DEBUG else None

app = FastAPI(
    title="Crypto4Pro Exchange API",
    description="Production-grade crypto exchange backend",
    version="1.0.0",
    lifespan=lifespan,
    docs_url=_docs_url,
    redoc_url=_redoc_url,
)

# P3-14: Request logging middleware (pure ASGI — safe with async SQLAlchemy)
app.add_middleware(RequestLoggingMiddleware)

# P3-16: Restrict CORS to specific methods and headers
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
)


# P1-6: Suppress stack traces in production
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    if settings.DEBUG:
        # In debug: log and return detail (don't re-raise — breaks async greenlet context)
        logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=500,
            content={"detail": str(exc)},
        )
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )

# Register routers — Public
app.include_router(auth_router)
app.include_router(balance_router)
app.include_router(ledger_router)
app.include_router(campaign_router)
app.include_router(cms_router)
app.include_router(market_router)
app.include_router(trading_router)
app.include_router(withdrawal_router)
app.include_router(orders_router)
app.include_router(ws_router)
app.include_router(wallet_router)
app.include_router(pay4pro_webhook_router)
app.include_router(deposits_router)
app.include_router(kyc_router)

# Register routers — Admin
app.include_router(admin_auth_router)
app.include_router(admin_users_router)
app.include_router(admin_campaigns_router)
app.include_router(admin_cms_router)
app.include_router(admin_flags_router)
app.include_router(admin_markets_router)
app.include_router(admin_logs_router)
app.include_router(admin_withdrawals_router)
app.include_router(admin_reconciliation_router)
app.include_router(admin_wallet_router)
app.include_router(admin_orders_router)
app.include_router(admin_wallets_ops_router)
app.include_router(admin_kyc_router)


@app.get("/api/health")
async def health_check():
    """Health check verifying DB, Redis, and Celery worker connectivity."""
    import redis.asyncio as aioredis
    from sqlalchemy import text

    health = {
        "status": "ok",
        "service": settings.APP_NAME,
        "env": settings.APP_ENV,
        "db": "ok",
        "redis": "ok",
        "celery": "ok",
    }

    # Check database
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception:
        health["db"] = "error"
        health["status"] = "degraded"

    # Check Redis
    r = None
    try:
        r = aioredis.from_url(settings.REDIS_URL)
        await r.ping()
    except Exception:
        health["redis"] = "error"
        health["status"] = "degraded"

    # Check Celery worker heartbeat via Redis broker
    # Celery workers publish heartbeats to a known key pattern
    try:
        broker = aioredis.from_url(settings.CELERY_BROKER_URL)
        # Check if any Celery worker has published within last 5 minutes
        # Workers register under celery-task-meta-* or _kombu.binding.*
        bindings = await broker.keys("_kombu.binding.*")
        await broker.aclose()
        if not bindings:
            health["celery"] = "no_workers"
            health["status"] = "degraded"
    except Exception:
        health["celery"] = "unknown"
        # Don't degrade status — Celery may not be required for all deployments

    if r:
        await r.aclose()

    status_code = 200 if health["status"] == "ok" else 503
    return JSONResponse(content=health, status_code=status_code)
