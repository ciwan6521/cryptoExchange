"""KYC provider webhook scaffold (Sumsub-compatible shape)."""

import hashlib
import hmac
import logging
import os
import uuid

from fastapi import APIRouter, Request, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from fastapi import Depends

router = APIRouter(prefix="/api/webhooks/kyc", tags=["kyc-webhook"])
logger = logging.getLogger("crypto4pro.kyc_webhook")

WEBHOOK_SECRET = os.environ.get("KYC_WEBHOOK_SECRET", "")


@router.post("/sumsub")
async def sumsub_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """
    Receives Sumsub-style applicant review webhooks.
    Set KYC_WEBHOOK_SECRET and configure Sumsub to POST here.
    """
    body = await request.body()
    if WEBHOOK_SECRET:
        sig = request.headers.get("x-payload-digest") or request.headers.get("X-Payload-Digest", "")
        expected = hmac.new(WEBHOOK_SECRET.encode(), body, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            raise HTTPException(status_code=401, detail="Invalid webhook signature")

    import json
    payload = json.loads(body.decode() or "{}")
    external_user_id = payload.get("externalUserId") or payload.get("applicantId")
    review_status = (
        payload.get("reviewResult", {}).get("reviewAnswer")
        or payload.get("type")
        or ""
    ).lower()

    if not external_user_id:
        return {"ok": True, "skipped": "no user id"}

    try:
        user_uuid = uuid.UUID(str(external_user_id))
    except ValueError:
        logger.warning("KYC webhook unknown external id: %s", external_user_id)
        return {"ok": True, "skipped": "invalid uuid"}

    result = await db.execute(select(User).where(User.id == user_uuid))
    user = result.scalar_one_or_none()
    if not user:
        return {"ok": True, "skipped": "user not found"}

    if review_status in ("green", "approved", "applicantreviewed"):
        user.kyc_status = "approved"
    elif review_status in ("red", "rejected", "declined"):
        user.kyc_status = "rejected"
    else:
        user.kyc_status = "pending"

    await db.commit()
    logger.info("KYC webhook: user=%s status=%s", user.id, user.kyc_status)
    return {"ok": True, "kyc_status": user.kyc_status}
