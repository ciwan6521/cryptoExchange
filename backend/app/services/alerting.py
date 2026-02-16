"""
Alerting service — sends notifications for critical events via webhook.

Supports: Slack, Discord, generic webhook (configurable via env vars).
Falls back to logging if no webhook is configured.

Events that trigger alerts:
- Ledger mismatch detected
- Large withdrawal approved
- Admin login from new IP
- Kill switch toggled
- Rate limit breach spike
"""

import logging
import json
from typing import Optional
from datetime import datetime, timezone

import httpx

from app.config import settings

logger = logging.getLogger("nexus.alerting")

# Webhook URL from environment (optional)
ALERT_WEBHOOK_URL: Optional[str] = getattr(settings, "ALERT_WEBHOOK_URL", None)


async def send_alert(
    title: str,
    message: str,
    severity: str = "warning",
    details: Optional[dict] = None,
) -> bool:
    """
    Send an alert notification.

    Args:
        title: Short alert title
        message: Detailed message
        severity: 'info', 'warning', 'critical'
        details: Optional key-value details

    Returns True if alert was sent successfully, False otherwise.
    """
    timestamp = datetime.now(timezone.utc).isoformat()

    # Always log locally
    log_msg = f"ALERT [{severity.upper()}] {title}: {message}"
    if severity == "critical":
        logger.critical(log_msg)
    elif severity == "warning":
        logger.warning(log_msg)
    else:
        logger.info(log_msg)

    # Send webhook if configured
    if not ALERT_WEBHOOK_URL:
        return True  # Logged only, no webhook

    # Build Slack-compatible payload
    color_map = {"info": "#36a64f", "warning": "#ff9900", "critical": "#ff0000"}
    payload = {
        "text": f"*[{severity.upper()}]* {title}",
        "attachments": [
            {
                "color": color_map.get(severity, "#cccccc"),
                "title": title,
                "text": message,
                "fields": [
                    {"title": k, "value": str(v), "short": True}
                    for k, v in (details or {}).items()
                ],
                "footer": f"Nexus Exchange | {settings.APP_ENV}",
                "ts": timestamp,
            }
        ],
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                ALERT_WEBHOOK_URL,
                json=payload,
                headers={"Content-Type": "application/json"},
            )
            if resp.status_code not in (200, 204):
                logger.error("Alert webhook returned %d: %s", resp.status_code, resp.text[:200])
                return False
            return True
    except Exception as e:
        logger.error("Failed to send alert webhook: %s", str(e)[:200])
        return False


# Convenience helpers
async def alert_ledger_mismatch(mismatches: list[dict]) -> bool:
    return await send_alert(
        title="Ledger Mismatch Detected",
        message=f"{len(mismatches)} asset(s) have balance discrepancies",
        severity="critical",
        details={"mismatches": json.dumps(mismatches)[:500]},
    )


async def alert_large_withdrawal(amount: str, asset: str, user_id: str, to_address: str) -> bool:
    return await send_alert(
        title="Large Withdrawal Approved",
        message=f"{amount} {asset} withdrawal approved",
        severity="warning",
        details={"user_id": user_id, "to_address": to_address[:20] + "..."},
    )


async def alert_kill_switch(flag: str, new_value: bool, admin_email: str) -> bool:
    return await send_alert(
        title=f"Kill Switch: {flag}",
        message=f"{flag} set to {new_value} by {admin_email}",
        severity="critical",
        details={"flag": flag, "value": str(new_value), "admin": admin_email},
    )
