"""
MarketDataService — fetches real-time crypto prices from Binance public API.

Features:
- Background polling every 5 seconds (non-blocking)
- Redis cache with 30s TTL (stale fallback if API fails)
- Retry with exponential backoff (3 attempts)
- 24h ticker data (price, change, high, low, volume)
- No API key required
- Rate-limit safe
"""

import asyncio
import json
import logging
import time
from decimal import Decimal, InvalidOperation
from typing import Optional

import httpx
import redis.asyncio as aioredis

from app.config import settings

logger = logging.getLogger("crypto4pro.market_data")

# Binance public endpoints — no API key, generous rate limits
BINANCE_TICKER_PRICE_URL = "https://api.binance.com/api/v3/ticker/price"
BINANCE_TICKER_24H_URL = "https://api.binance.com/api/v3/ticker/24hr"

# Maps our asset symbols to Binance trading pair symbols (priced in USDT)
ASSET_TO_BINANCE: dict[str, str] = {
    "BTC": "BTCUSDT",
    "ETH": "ETHUSDT",
    "BNB": "BNBUSDT",
    "SOL": "SOLUSDT",
    "XRP": "XRPUSDT",
    "ADA": "ADAUSDT",
    "DOGE": "DOGEUSDT",
    "TRX": "TRXUSDT",
    "AVAX": "AVAXUSDT",
    "LINK": "LINKUSDT",
    "DOT": "DOTUSDT",
}

CACHE_TTL_SECONDS = 30
CACHE_KEY_PREFIX = "market:price:"
CACHE_TICKER_PREFIX = "market:ticker24h:"
POLL_INTERVAL_SECONDS = 5
MAX_RETRIES = 3
RETRY_BASE_DELAY = 1.0  # seconds


class MarketDataService:
    def __init__(self):
        self._redis: Optional[aioredis.Redis] = None
        self._http: Optional[httpx.AsyncClient] = None
        self._poll_task: Optional[asyncio.Task] = None
        self._running = False
        self._last_fetch_time: float = 0

    async def _get_redis(self) -> aioredis.Redis:
        if self._redis is None:
            self._redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        return self._redis

    async def _get_http(self) -> httpx.AsyncClient:
        if self._http is None or self._http.is_closed:
            self._http = httpx.AsyncClient(
                timeout=httpx.Timeout(10.0, connect=5.0),
                limits=httpx.Limits(max_connections=10, max_keepalive_connections=5),
            )
        return self._http

    # ------------------------------------------------------------------
    # Background polling
    # ------------------------------------------------------------------

    async def start_polling(self):
        """Start background price polling loop."""
        if self._running:
            return
        self._running = True
        self._poll_task = asyncio.create_task(self._poll_loop())
        logger.info("MarketDataService: background polling started (every %ds)", POLL_INTERVAL_SECONDS)

    async def stop_polling(self):
        """Stop background polling."""
        self._running = False
        if self._poll_task:
            self._poll_task.cancel()
            try:
                await self._poll_task
            except asyncio.CancelledError:
                pass
            self._poll_task = None
        logger.info("MarketDataService: polling stopped")

    async def _poll_loop(self):
        """Continuously fetch prices every POLL_INTERVAL_SECONDS."""
        while self._running:
            try:
                await self._fetch_and_cache_all()
            except Exception as e:
                logger.error("Poll cycle error: %s", e)
            await asyncio.sleep(POLL_INTERVAL_SECONDS)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def fetch_prices(self) -> dict[str, Optional[str]]:
        """
        Get current USD prices for all supported assets.
        Returns from cache if fresh; otherwise fetches live.
        """
        r = await self._get_redis()

        # Try cache first
        cached = {}
        all_cached = True
        all_symbols = list(ASSET_TO_BINANCE.keys()) + ["USDT"]
        for symbol in all_symbols:
            val = await r.get(f"{CACHE_KEY_PREFIX}{symbol}")
            if val is not None:
                cached[symbol] = val
            else:
                all_cached = False

        if all_cached and len(cached) == len(all_symbols):
            return cached

        # Cache miss — fetch live
        await self._fetch_and_cache_all()

        # Re-read from cache
        result: dict[str, Optional[str]] = {}
        for symbol in all_symbols:
            val = await r.get(f"{CACHE_KEY_PREFIX}{symbol}")
            result[symbol] = val if val is not None else cached.get(symbol)
        return result

    async def fetch_tickers(self) -> dict[str, dict]:
        """
        Get 24h ticker data for all supported assets.
        Returns dict like {"BTC": {"price": "...", "change": "2.34", "high": "...", ...}}.
        """
        r = await self._get_redis()
        result: dict[str, dict] = {}

        for symbol in list(ASSET_TO_BINANCE.keys()) + ["USDT"]:
            raw = await r.get(f"{CACHE_TICKER_PREFIX}{symbol}")
            if raw:
                try:
                    result[symbol] = json.loads(raw)
                except json.JSONDecodeError:
                    pass

        # If empty, trigger a fetch
        if not result:
            await self._fetch_and_cache_all()
            for symbol in list(ASSET_TO_BINANCE.keys()) + ["USDT"]:
                raw = await r.get(f"{CACHE_TICKER_PREFIX}{symbol}")
                if raw:
                    try:
                        result[symbol] = json.loads(raw)
                    except json.JSONDecodeError:
                        pass

        return result

    async def get_price(self, symbol: str) -> Optional[str]:
        """Get cached price for a single asset."""
        r = await self._get_redis()
        val = await r.get(f"{CACHE_KEY_PREFIX}{symbol}")
        if val is not None:
            return val
        prices = await self.fetch_prices()
        return prices.get(symbol)

    # ------------------------------------------------------------------
    # Internal fetch + cache
    # ------------------------------------------------------------------

    async def _fetch_and_cache_all(self):
        """Fetch from Binance with retry and cache results."""
        data_24h = await self._fetch_with_retry(BINANCE_TICKER_24H_URL)
        if not data_24h:
            return

        r = await self._get_redis()
        reverse = {v: k for k, v in ASSET_TO_BINANCE.items()}

        for item in data_24h:
            binance_symbol = item.get("symbol")
            if binance_symbol not in reverse:
                continue
            asset = reverse[binance_symbol]

            price = item.get("lastPrice", "0")
            try:
                Decimal(price)
            except (InvalidOperation, ValueError):
                continue

            # Cache simple price
            await r.setex(f"{CACHE_KEY_PREFIX}{asset}", CACHE_TTL_SECONDS, price)

            # Cache full 24h ticker
            ticker = {
                "price": price,
                "change": item.get("priceChangePercent", "0"),
                "high": item.get("highPrice", "0"),
                "low": item.get("lowPrice", "0"),
                "volume": item.get("volume", "0"),
                "quoteVolume": item.get("quoteVolume", "0"),
            }
            await r.setex(f"{CACHE_TICKER_PREFIX}{asset}", CACHE_TTL_SECONDS, json.dumps(ticker))

        # USDT is always $1
        await r.setex(f"{CACHE_KEY_PREFIX}USDT", CACHE_TTL_SECONDS, "1")
        usdt_ticker = {"price": "1", "change": "0", "high": "1", "low": "1", "volume": "0", "quoteVolume": "0"}
        await r.setex(f"{CACHE_TICKER_PREFIX}USDT", CACHE_TTL_SECONDS, json.dumps(usdt_ticker))

        self._last_fetch_time = time.time()

    async def _fetch_with_retry(self, url: str) -> Optional[list]:
        """Fetch from Binance with exponential backoff retry."""
        client = await self._get_http()
        last_err = None

        for attempt in range(MAX_RETRIES):
            try:
                resp = await client.get(url)
                resp.raise_for_status()
                return resp.json()
            except Exception as e:
                last_err = e
                if attempt < MAX_RETRIES - 1:
                    delay = RETRY_BASE_DELAY * (2 ** attempt)
                    logger.warning("Binance fetch attempt %d failed: %s, retrying in %.1fs", attempt + 1, e, delay)
                    await asyncio.sleep(delay)

        logger.error("Binance fetch failed after %d retries: %s", MAX_RETRIES, last_err)
        return None

    # ------------------------------------------------------------------
    # Cleanup
    # ------------------------------------------------------------------

    async def close(self):
        await self.stop_polling()
        if self._http and not self._http.is_closed:
            await self._http.aclose()
            self._http = None
        if self._redis:
            await self._redis.aclose()
            self._redis = None


# Singleton instance
_market_data_service: Optional[MarketDataService] = None


def get_market_data_service() -> MarketDataService:
    global _market_data_service
    if _market_data_service is None:
        _market_data_service = MarketDataService()
    return _market_data_service
