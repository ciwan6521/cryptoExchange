"""
KYC API — document upload and status for user identity verification.
Files are stored locally at /app/uploads/kyc/.
"""

import os
import uuid
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User, KYCDocument
from app.api.deps import get_current_user

logger = logging.getLogger("crypto4pro.kyc")

router = APIRouter(prefix="/api/kyc", tags=["kyc"])

UPLOAD_DIR = "/app/uploads/kyc"
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/jpg"}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB
VALID_DOC_TYPES = {"id_front", "id_back", "proof_of_address"}
REQUIRED_DOC_TYPES = {"id_front", "id_back", "proof_of_address"}


def _ensure_upload_dir():
    os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.post("/upload")
async def upload_kyc_document(
    document_type: str = Form(...),
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if document_type not in VALID_DOC_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid document_type. Must be one of: {', '.join(VALID_DOC_TYPES)}")

    if user.kyc_status == "approved":
        raise HTTPException(status_code=400, detail="KYC already approved")

    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Only JPEG/PNG images are accepted")

    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File size exceeds 5 MB limit")

    _ensure_upload_dir()

    ext = "jpg" if "jpeg" in (file.content_type or "") or "jpg" in (file.content_type or "") else "png"
    ts = int(datetime.now(timezone.utc).timestamp())
    filename = f"{user.id}_{document_type}_{ts}.{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)

    with open(filepath, "wb") as f:
        f.write(contents)

    existing = await db.execute(
        select(KYCDocument).where(
            KYCDocument.user_id == user.id,
            KYCDocument.document_type == document_type,
        )
    )
    doc = existing.scalar_one_or_none()

    if doc:
        if doc.file_path and os.path.exists(doc.file_path):
            try:
                os.remove(doc.file_path)
            except OSError:
                pass
        doc.file_path = filepath
        doc.original_filename = file.filename
        doc.status = "pending"
        doc.rejection_reason = None
        doc.reviewed_by = None
        doc.reviewed_at = None
    else:
        doc = KYCDocument(
            user_id=user.id,
            document_type=document_type,
            file_path=filepath,
            original_filename=file.filename,
            status="pending",
        )
        db.add(doc)

    all_uploaded = await _check_all_required_uploaded(user.id, db, just_uploaded=document_type)
    if all_uploaded:
        user.kyc_status = "pending"

    await db.commit()

    logger.info("KYC document uploaded: user=%s type=%s file=%s", user.id, document_type, filename)

    return {
        "ok": True,
        "document_id": str(doc.id),
        "document_type": document_type,
        "status": doc.status,
    }


async def _check_all_required_uploaded(user_id: uuid.UUID, db: AsyncSession, just_uploaded: str) -> bool:
    """Check if all required document types have been uploaded (including the one just uploaded)."""
    result = await db.execute(
        select(KYCDocument.document_type).where(KYCDocument.user_id == user_id)
    )
    uploaded_types = set(result.scalars().all())
    uploaded_types.add(just_uploaded)
    return REQUIRED_DOC_TYPES.issubset(uploaded_types)


@router.get("/status")
async def get_kyc_status(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(KYCDocument).where(KYCDocument.user_id == user.id)
    )
    docs = result.scalars().all()

    documents = []
    for doc in docs:
        documents.append({
            "id": str(doc.id),
            "document_type": doc.document_type,
            "status": doc.status,
            "rejection_reason": doc.rejection_reason,
            "created_at": doc.created_at.isoformat() if doc.created_at else None,
        })

    return {
        "kyc_status": user.kyc_status,
        "documents": documents,
    }
