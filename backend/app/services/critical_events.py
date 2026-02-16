"""
Structured Critical Event Logger.

Logs financial and security events to both:
1. audit_logs table (queryable, admin-visible)
2. Python logger at CRITICAL/WARNING level (for SIEM/alerting)

Events covered:
- withdrawal_requested
- withdrawal_approved
- withdrawal_rejected
- withdrawal_settled
- kill_switch_toggled
- ledger_mismatch_detected
- suspicious_activity
- large_admin_operation

Risk prevented: Without structured logging, incidents cannot be
investigated after the fact. These logs are the forensic trail.
"""

import logging
import uuid
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cms import AuditLog

logger = logging.getLogger("nexus.critical")


async def log_critical_event(
    db: AsyncSession,
    event_type: str,
    details: dict,
    admin_id: Optional[uuid.UUID] = None,
    target_type: Optional[str] = None,
    target_id: Optional[uuid.UUID] = None,
    ip_address: Optional[str] = None,
    severity: str = "warning",
) -> AuditLog:
    """
    Record a critical event to both DB and structured log output.

    Args:
        event_type: One of the defined critical event types
        details: JSON-serializable event details
        admin_id: Admin who triggered the event (if applicable)
        target_type: Entity type affected (withdrawal, system, user, etc.)
        target_id: Entity ID affected
        ip_address: Source IP
        severity: 'info', 'warning', 'critical'
    """
    log_entry = AuditLog(
        admin_id=admin_id,
        action=event_type,
        target_type=target_type,
        target_id=target_id,
        details=details,
        ip_address=ip_address,
    )
    db.add(log_entry)

    # Structured log output for external SIEM/monitoring
    log_data = {
        "event": event_type,
        "target_type": target_type,
        "target_id": str(target_id) if target_id else None,
        "admin_id": str(admin_id) if admin_id else None,
        "ip": ip_address,
        **{k: str(v) for k, v in details.items()},
    }

    if severity == "critical":
        logger.critical("CRITICAL_EVENT: %s %s", event_type, log_data)
    elif severity == "warning":
        logger.warning("CRITICAL_EVENT: %s %s", event_type, log_data)
    else:
        logger.info("CRITICAL_EVENT: %s %s", event_type, log_data)

    return log_entry
