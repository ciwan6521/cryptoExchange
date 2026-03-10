"""
Public market data routes — trading pairs, tickers, orderbook.
Price data is currently sourced from internal state.
In production, this would integrate with external feeds (Binance, etc.)
"""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.trading import TradingPair
from app.models.cms import SystemFlag
from app.services.market_data import get_market_data_service

router = APIRouter(prefix="/api/market", tags=["market"])


@router.get("/pairs")
async def get_trading_pairs(db: AsyncSession = Depends(get_db)):
    """Get all trading pair configurations (public)."""
    result = await db.execute(select(TradingPair).order_by(TradingPair.symbol))
    pairs = list(result.scalars().all())
    return {
        "pairs": [
            {
                "symbol": p.symbol,
                "base_asset": p.base_asset,
                "quote_asset": p.quote_asset,
                "price_precision": p.price_precision,
                "quantity_precision": p.quantity_precision,
                "tick_size": str(p.tick_size),
                "step_size": str(p.step_size),
                "min_order_size": str(p.min_order_size),
                "max_order_size": str(p.max_order_size),
                "min_notional": str(p.min_notional),
                "maker_fee": str(p.maker_fee),
                "taker_fee": str(p.taker_fee),
                "is_enabled": p.is_enabled,
            }
            for p in pairs
        ]
    }


@router.get("/flags")
async def get_system_flags(db: AsyncSession = Depends(get_db)):
    """Get public system flags (trading enabled, maintenance, etc.)."""
    result = await db.execute(select(SystemFlag))
    flags = {f.key: f.value for f in result.scalars().all()}
    defaults = {
        "trading_enabled": True,
        "new_orders_enabled": True,
        "deposits_enabled": True,
        "withdrawals_enabled": True,
        "maintenance_mode": False,
        "registration_enabled": True,
    }
    return {"flags": {**defaults, **flags}}


@router.get("/prices")
async def get_market_prices():
    """Get live USD prices for all supported assets (public, cached 30s)."""
    market = get_market_data_service()
    prices = await market.fetch_prices()
    return {"prices": prices}


@router.get("/tickers")
async def get_market_tickers():
    """Get 24h ticker data for all supported assets (public, cached 5s)."""
    market = get_market_data_service()
    tickers = await market.fetch_tickers()
    return {"tickers": tickers}


@router.get("/deposit-methods")
async def get_deposit_methods(db: AsyncSession = Depends(get_db)):
    """Get active deposit methods (crypto wallets & bank accounts) for users."""
    from app.models.deposit_method import DepositMethod
    result = await db.execute(
        select(DepositMethod)
        .where(DepositMethod.is_active == True)
        .order_by(DepositMethod.sort_order, DepositMethod.created_at)
    )
    methods = result.scalars().all()
    return {
        "methods": [
            {
                "id": str(m.id),
                "method_type": m.method_type,
                "label": m.label,
                "asset": m.asset,
                "network": m.network,
                "address": m.address,
                "memo_tag": m.memo_tag,
                "bank_name": m.bank_name,
                "account_holder": m.account_holder,
                "iban": m.iban,
                "swift_code": m.swift_code,
                "currency": m.currency,
                "reference_note": m.reference_note,
                "notes": m.notes,
                "min_amount": m.min_amount,
            }
            for m in methods
        ]
    }
