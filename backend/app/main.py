"""
Nexus Exchange — FastAPI Application Entry Point

Production-grade crypto exchange backend with:
- Double-entry ledger system
- Event-driven campaign reward engine
- JWT auth (separate user/admin)
- Real-time WebSocket market data
- Audit logging for all admin actions
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import engine, Base
from app.events.bus import EventBus

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


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    # Startup
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    # Initialize event bus
    await EventBus.get_instance()
    
    yield
    
    # Shutdown
    await EventBus.close()
    await engine.dispose()


app = FastAPI(
    title="Nexus Exchange API",
    description="Production-grade crypto exchange backend",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers — Public
app.include_router(auth_router)
app.include_router(balance_router)
app.include_router(ledger_router)
app.include_router(campaign_router)
app.include_router(cms_router)
app.include_router(market_router)
app.include_router(trading_router)

# Register routers — Admin
app.include_router(admin_auth_router)
app.include_router(admin_users_router)
app.include_router(admin_campaigns_router)
app.include_router(admin_cms_router)
app.include_router(admin_flags_router)
app.include_router(admin_markets_router)
app.include_router(admin_logs_router)


@app.get("/api/health")
async def health_check():
    return {
        "status": "ok",
        "service": settings.APP_NAME,
        "env": settings.APP_ENV,
    }
