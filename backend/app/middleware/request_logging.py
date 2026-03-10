"""
Request logging middleware — logs method, path, status, duration, IP for every request.
Structured logging for security auditing and performance monitoring.

Uses pure ASGI middleware (not BaseHTTPMiddleware) to avoid breaking
async SQLAlchemy's greenlet context which causes MissingGreenlet errors.
"""

import time
import logging
from starlette.types import ASGIApp, Receive, Scope, Send

logger = logging.getLogger("crypto4pro.access")


class RequestLoggingMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return

        start = time.monotonic()
        client = scope.get("client")
        client_ip = client[0] if client else "-"
        method = scope.get("method", "WS")
        path = scope.get("path", "/")

        status_code = 0

        async def send_wrapper(message):
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message.get("status", 0)
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        except Exception:
            duration_ms = (time.monotonic() - start) * 1000
            logger.error(
                "%s %s 500 %.1fms ip=%s",
                method, path, duration_ms, client_ip,
            )
            raise

        duration_ms = (time.monotonic() - start) * 1000
        logger.info(
            "%s %s %d %.1fms ip=%s",
            method, path, status_code, duration_ms, client_ip,
        )
