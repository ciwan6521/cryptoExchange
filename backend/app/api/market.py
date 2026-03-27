"""
Public market data routes — trading pairs, tickers, orderbook, klines.
Price data sourced from Binance API via backend cache / proxy.
"""

import httpx
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.trading import TradingPair
from app.models.cms import SystemFlag
from app.services.market_data import get_market_data_service

router = APIRouter(prefix="/api/market", tags=["market"])

BINANCE_KLINES_URL = "https://api.binance.com/api/v3/klines"
VALID_INTERVALS = {"1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "8h", "12h", "1d", "3d", "1w", "1M"}


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


@router.get("/klines")
async def get_klines(
    symbol: str = Query(..., description="Trading pair e.g. BTC-USDT or BTCUSDT"),
    interval: str = Query("15m", description="Candle interval"),
    limit: int = Query(200, ge=1, le=1000),
):
    """Proxy Binance klines for charting. Converts our symbol format to Binance format."""
    if interval not in VALID_INTERVALS:
        raise HTTPException(status_code=400, detail=f"Invalid interval: {interval}")

    binance_symbol = symbol.upper().replace("-", "").replace("/", "")
    if not binance_symbol.endswith("USDT"):
        binance_symbol += "USDT"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                BINANCE_KLINES_URL,
                params={"symbol": binance_symbol, "interval": interval, "limit": limit},
            )
            resp.raise_for_status()
            raw = resp.json()
    except Exception:
        raise HTTPException(status_code=502, detail="Failed to fetch klines from upstream")

    candles = [
        {
            "time": int(k[0]) // 1000,
            "open": float(k[1]),
            "high": float(k[2]),
            "low": float(k[3]),
            "close": float(k[4]),
            "volume": float(k[5]),
        }
        for k in raw
    ]
    return {"symbol": binance_symbol, "interval": interval, "candles": candles}


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
