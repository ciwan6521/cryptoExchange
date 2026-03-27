"""
Pay4Pro API Client — all blockchain operations go through Pay4Pro.

Crypto4Pro NEVER talks to blockchain or QuickNode directly.
This service is the sole bridge between Crypto4Pro and the blockchain world.

Architecture:
    Crypto4Pro (Exchange) → Pay4Pro API (Wallet Service) → QuickNode (Blockchain)

Auth: X-API-Key header (project API key from Pay4Pro admin panel)
Network: BSC (Binance Smart Chain)
Response format: {"success": true/false, "data": {...}} or {"success": false, "error": "..."}
"""

import logging
from decimal import Decimal
from typing import Optional
from dataclasses import dataclass

import httpx

from app.config import settings

logger = logging.getLogger("crypto4pro.pay4pro")

_TIMEOUT = 30.0
_MAX_RETRIES = 3


@dataclass
class Pay4ProWallet:
    address: str
    asset: str
    user_id: str


@dataclass
class Pay4ProBalance:
    address: str
    balances: dict[str, Decimal]
    user_id: str


@dataclass
class Pay4ProDeposit:
    tx_hash: str
    amount: Decimal
    token: str
    status: str
    from_address: str
    block_number: str
    confirmations: int
    created_at: str


@dataclass
class Pay4ProWithdrawal:
    transaction_id: str
    withdraw_id: str
    status: str
    amount: Decimal
    currency: str


@dataclass
class Pay4ProMasterBalance:
    address: str
    bnb: Decimal
    usdt: Decimal
    is_low_bnb: bool


class Pay4ProError(Exception):
    """Raised when Pay4Pro API returns an error."""
    def __init__(self, message: str, status_code: int = 0):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class Pay4ProClient:
    """
    HTTP client for Pay4Pro wallet/payment API.
    Uses X-API-Key header for authentication.
    """

    def __init__(self):
        self.base_url = settings.PAY4PRO_BASE_URL.rstrip("/") if settings.PAY4PRO_BASE_URL else ""
        self.api_key = settings.PAY4PRO_API_KEY
        self.webhook_secret = settings.PAY4PRO_WEBHOOK_SECRET

    def _api_headers(self) -> dict:
        """Headers for API Key authenticated requests."""
        return {
            "X-API-Key": self.api_key,
            "Content-Type": "application/json",
        }

    async def _request(
        self,
        method: str,
        path: str,
        json_data: Optional[dict] = None,
        params: Optional[dict] = None,
    ) -> dict:
        """Make an authenticated request to Pay4Pro with retry logic."""
        url = f"{self.base_url}{path}"
        last_error = None

        for attempt in range(1, _MAX_RETRIES + 1):
            try:
                async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                    response = await client.request(
                        method=method,
                        url=url,
                        headers=self._api_headers(),
                        json=json_data,
                        params=params,
                    )

                if response.status_code >= 500:
                    last_error = Pay4ProError(
                        f"Pay4Pro server error: {response.status_code}",
                        status_code=response.status_code,
                    )
                    logger.warning(
                        "Pay4Pro %s %s returned %d (attempt %d/%d)",
                        method, path, response.status_code, attempt, _MAX_RETRIES,
                    )
                    if attempt < _MAX_RETRIES:
                        await _backoff(attempt)
                        continue
                    raise last_error

                data = response.json()

                if not data.get("success", False):
                    error_msg = data.get("error", "Unknown Pay4Pro error")
                    status_code = data.get("statusCode", response.status_code)
                    raise Pay4ProError(error_msg, status_code)

                return data.get("data", {})

            except httpx.RequestError as e:
                last_error = Pay4ProError(f"Pay4Pro connection error: {e}")
                logger.warning(
                    "Pay4Pro connection error on %s %s (attempt %d/%d): %s",
                    method, path, attempt, _MAX_RETRIES, e,
                )
                if attempt < _MAX_RETRIES:
                    await _backoff(attempt)
                    continue
                raise last_error

        raise last_error or Pay4ProError("Max retries exceeded")

    # ── Wallet Operations ──

    async def get_or_create_wallet(self, user_id: str) -> Pay4ProWallet:
        """
        Get or create a BSC wallet for a user.
        Pay4Pro auto-creates the wallet if it doesn't exist.

        GET /api/wallet/address?user_id=xxx
        """
        data = await self._request("GET", "/api/wallet/address", params={
            "user_id": user_id,
        })

        wallet = Pay4ProWallet(
            address=data["address"],
            asset=data.get("asset", "BSC"),
            user_id=data.get("user_id", user_id),
        )
        logger.info(
            "Pay4Pro wallet for user=%s → address=%s",
            user_id, wallet.address,
        )
        return wallet

    async def get_wallet_balance(self, user_id: str) -> Pay4ProBalance:
        """
        Get on-chain balance of a user's wallet.

        GET /api/wallet/balance?user_id=xxx
        """
        data = await self._request("GET", "/api/wallet/balance", params={
            "user_id": user_id,
        })

        raw_balances = data.get("balances", {})
        balances = {k: Decimal(str(v)) for k, v in raw_balances.items()}

        return Pay4ProBalance(
            address=data.get("address", ""),
            balances=balances,
            user_id=data.get("user_id", user_id),
        )

    async def get_wallet_deposits(
        self,
        user_id: str,
        page: int = 1,
        limit: int = 20,
    ) -> tuple[list[Pay4ProDeposit], int]:
        """
        Get deposit history for a user's wallet.

        GET /api/wallet/deposits?user_id=xxx&page=1&limit=20
        """
        data = await self._request("GET", "/api/wallet/deposits", params={
            "user_id": user_id,
            "page": page,
            "limit": limit,
        })

        deposits = []
        for d in data.get("data", []):
            deposits.append(Pay4ProDeposit(
                tx_hash=d.get("tx_hash", ""),
                amount=Decimal(str(d.get("amount", "0"))),
                token=d.get("token", "USDT"),
                status=d.get("status", "unknown"),
                from_address=d.get("from_address", ""),
                block_number=d.get("block_number", ""),
                confirmations=d.get("confirmations", 0),
                created_at=d.get("created_at", ""),
            ))

        total = data.get("total", len(deposits))
        return deposits, total

    # ── Deposit Operations ──

    async def create_deposit(
        self,
        user_id: str,
        amount: Decimal,
        currency: str = "USDT",
        method: str = "crypto",
        metadata: Optional[dict] = None,
    ) -> dict:
        """
        Create a deposit request.

        POST /api/deposit
        """
        data = await self._request("POST", "/api/deposit", json_data={
            "user_id": user_id,
            "amount": float(amount),
            "currency": currency,
            "method": method,
            "metadata": metadata or {},
        })

        logger.info(
            "Pay4Pro deposit created: tx=%s user=%s amount=%s %s",
            data.get("transaction_id"), user_id, amount, currency,
        )
        return data

    # ── Withdrawal Operations ──

    async def request_withdrawal(
        self,
        user_id: str,
        amount: Decimal,
        wallet_address: str,
        currency: str = "USDT",
        network: str = "BSC",
        metadata: Optional[dict] = None,
    ) -> Pay4ProWithdrawal:
        """
        Request a withdrawal via Pay4Pro.

        POST /api/withdraw

        Pay4Pro will hold it for admin approval, then auto-send blockchain TX.
        """
        data = await self._request("POST", "/api/withdraw", json_data={
            "user_id": user_id,
            "amount": float(amount),
            "currency": currency,
            "method": "crypto",
            "destination": {
                "wallet_address": wallet_address,
                "network": network,
            },
            "metadata": metadata or {},
        })

        result = Pay4ProWithdrawal(
            transaction_id=data.get("transaction_id", ""),
            withdraw_id=data.get("withdraw_id", ""),
            status=data.get("status", "pending"),
            amount=Decimal(str(data.get("amount", amount))),
            currency=data.get("currency", currency),
        )
        logger.info(
            "Pay4Pro withdrawal requested: tx=%s withdraw=%s amount=%s %s to=%s",
            result.transaction_id, result.withdraw_id, amount, currency, wallet_address,
        )
        return result

    # ── Payment Methods ──

    async def get_payment_methods(self) -> list[dict]:
        """
        Get active payment methods from Pay4Pro.

        GET /api/payment-methods
        Returns crypto, bank_transfer, papara, etc.
        """
        data = await self._request("GET", "/api/payment-methods")

        if isinstance(data, list):
            return data
        return data.get("data", data.get("methods", []))

    # ── Transaction Status ──

    async def get_transaction(self, tx_ref: str) -> dict:
        """
        Get transaction details by reference code.

        GET /api/transaction/:txRef
        """
        return await self._request("GET", f"/api/transaction/{tx_ref}")

    # ── Webhook Verification ──

    def verify_webhook_secret(self, request_secret: str) -> bool:
        """
        Verify the X-Webhook-Secret header from Pay4Pro webhook.

        Pay4Pro sends the project's webhook secret in the X-Webhook-Secret header.
        We compare it against our configured PAY4PRO_WEBHOOK_SECRET.
        """
        if not self.webhook_secret:
            logger.error("PAY4PRO_WEBHOOK_SECRET not configured — rejecting webhook")
            return False

        if not request_secret:
            logger.warning("Webhook received without X-Webhook-Secret header")
            return False

        # Constant-time comparison to prevent timing attacks
        import hmac
        return hmac.compare_digest(self.webhook_secret, request_secret)


async def _backoff(attempt: int) -> None:
    """Exponential backoff between retries."""
    import asyncio
    delay = min(2 ** attempt, 10)
    await asyncio.sleep(delay)


# Singleton
_client: Optional[Pay4ProClient] = None


def get_pay4pro_client() -> Pay4ProClient:
    global _client
    if _client is None:
        _client = Pay4ProClient()
    return _client
