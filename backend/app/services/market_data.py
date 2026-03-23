"""
MarketDataService — fetches real-time crypto prices from Binance public API.

Now dynamically fetches the TOP 100 coins by 24h USDT volume.
No hardcoded list — fully automatic.

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
BINANCE_TICKER_24H_URL = "https://api.binance.com/api/v3/ticker/24hr"

# Filter: only keep USDT-quoted pairs, exclude leveraged/stablecoin noise
EXCLUDED_BASES = {
    "USDC", "BUSD", "TUSD", "FDUSD", "DAI", "USDP", "USDD", "EUR", "GBP",
    "TRY", "BRL", "ARS", "AEUR", "BIDR", "IDRT", "UAH", "NGN", "PLN",
    "RON", "ZAR",
}
# Exclude leveraged tokens (end with UP/DOWN/BULL/BEAR)
LEVERAGED_SUFFIXES = ("UP", "DOWN", "BULL", "BEAR")

TOP_N = 100

CACHE_TTL_SECONDS = 30
CACHE_KEY_PREFIX = "market:price:"
CACHE_TICKER_PREFIX = "market:ticker24h:"
CACHE_TOP_LIST_KEY = "market:top100"
POLL_INTERVAL_SECONDS = 5
MAX_RETRIES = 3
RETRY_BASE_DELAY = 1.0


class MarketDataService:
    def __init__(self):
        self._redis: Optional[aioredis.Redis] = None
        self._http: Optional[httpx.AsyncClient] = None
        self._poll_task: Optional[asyncio.Task] = None
        self._running = False
        self._last_fetch_time: float = 0
        # Dynamic symbol set — updated each poll cycle
        self._active_symbols: set[str] = set()

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
        if self._running:
            return
        self._running = True
        self._poll_task = asyncio.create_task(self._poll_loop())
        logger.info("MarketDataService: polling started — top %d by volume, every %ds", TOP_N, POLL_INTERVAL_SECONDS)

    async def stop_polling(self):
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
        """Get current USD prices for all top-100 assets."""
        r = await self._get_redis()

        symbols = await self._get_active_symbols()
        result: dict[str, Optional[str]] = {}
        for symbol in symbols:
            val = await r.get(f"{CACHE_KEY_PREFIX}{symbol}")
            result[symbol] = val

        # Always include USDT
        result["USDT"] = "1"
        return result

    async def fetch_tickers(self) -> dict[str, dict]:
        """Get 24h ticker data for all top-100 assets."""
        r = await self._get_redis()
        result: dict[str, dict] = {}

        symbols = await self._get_active_symbols()
        for symbol in symbols:
            raw = await r.get(f"{CACHE_TICKER_PREFIX}{symbol}")
            if raw:
                try:
                    result[symbol] = json.loads(raw)
                except json.JSONDecodeError:
                    pass

        if not result:
            await self._fetch_and_cache_all()
            for symbol in symbols:
                raw = await r.get(f"{CACHE_TICKER_PREFIX}{symbol}")
                if raw:
                    try:
                        result[symbol] = json.loads(raw)
                    except json.JSONDecodeError:
                        pass

        # Always include USDT
        result["USDT"] = {"price": "1", "change": "0", "high": "1", "low": "1", "volume": "0", "quoteVolume": "0"}
        return result

    async def get_price(self, symbol: str) -> Optional[str]:
        r = await self._get_redis()
        val = await r.get(f"{CACHE_KEY_PREFIX}{symbol}")
        if val is not None:
            return val
        prices = await self.fetch_prices()
        return prices.get(symbol)

    async def _get_active_symbols(self) -> set[str]:
        """Return current top-N symbols. Falls back to cached list in Redis."""
        if self._active_symbols:
            return self._active_symbols

        r = await self._get_redis()
        raw = await r.get(CACHE_TOP_LIST_KEY)
        if raw:
            self._active_symbols = set(json.loads(raw))
        return self._active_symbols

    # ------------------------------------------------------------------
    # Internal fetch + cache
    # ------------------------------------------------------------------

    async def _fetch_and_cache_all(self):
        """Fetch all 24h tickers from Binance, rank by volume, cache top N."""
        data_24h = await self._fetch_with_retry(BINANCE_TICKER_24H_URL)
        if not data_24h:
            return

        # Filter to USDT pairs and rank by quote volume
        usdt_pairs: list[tuple[str, dict]] = []

        for item in data_24h:
            binance_symbol: str = item.get("symbol", "")
            if not binance_symbol.endswith("USDT"):
                continue

            base = binance_symbol[:-4]  # Remove "USDT" suffix

            if not base or base in EXCLUDED_BASES:
                continue
            if any(base.endswith(s) for s in LEVERAGED_SUFFIXES):
                continue

            try:
                quote_vol = float(item.get("quoteVolume", "0"))
            except (ValueError, TypeError):
                quote_vol = 0

            usdt_pairs.append((base, {**item, "_quote_vol": quote_vol}))

        # Sort by 24h USDT volume descending, take top N
        usdt_pairs.sort(key=lambda x: x[1]["_quote_vol"], reverse=True)
        top_pairs = usdt_pairs[:TOP_N]

        r = await self._get_redis()
        new_symbols: set[str] = set()

        for base, item in top_pairs:
            price = item.get("lastPrice", "0")
            try:
                Decimal(price)
            except (InvalidOperation, ValueError):
                continue

            new_symbols.add(base)

            # Cache simple price
            await r.setex(f"{CACHE_KEY_PREFIX}{base}", CACHE_TTL_SECONDS, price)

            # Cache full 24h ticker
            ticker = {
                "price": price,
                "change": item.get("priceChangePercent", "0"),
                "high": item.get("highPrice", "0"),
                "low": item.get("lowPrice", "0"),
                "volume": item.get("volume", "0"),
                "quoteVolume": item.get("quoteVolume", "0"),
            }
            await r.setex(f"{CACHE_TICKER_PREFIX}{base}", CACHE_TTL_SECONDS, json.dumps(ticker))

        # USDT is always $1
        await r.setex(f"{CACHE_KEY_PREFIX}USDT", CACHE_TTL_SECONDS, "1")

        # Cache the active symbol list (for other services to discover)
        self._active_symbols = new_symbols
        await r.setex(CACHE_TOP_LIST_KEY, CACHE_TTL_SECONDS * 2, json.dumps(sorted(new_symbols)))

        self._last_fetch_time = time.time()

    async def _fetch_with_retry(self, url: str) -> Optional[list]:
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


# Singleton
_market_data_service: Optional[MarketDataService] = None


def get_market_data_service() -> MarketDataService:
    global _market_data_service
    if _market_data_service is None:
        _market_data_service = MarketDataService()
    return _market_data_service
