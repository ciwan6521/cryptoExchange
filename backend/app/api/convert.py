"""Instant asset convert / swap API."""

from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.api.deps import get_current_user
from app.api.deps_flags import require_trading_enabled
from app.services.convert_service import get_convert_quote, execute_convert, ConvertError

router = APIRouter(prefix="/api/convert", tags=["convert"])


class ConvertQuoteRequest(BaseModel):
    from_asset: str = Field(min_length=2, max_length=20)
    to_asset: str = Field(min_length=2, max_length=20)
    from_amount: str


class ConvertExecuteRequest(ConvertQuoteRequest):
    pass


@router.get("/assets")
async def list_convert_assets():
    """Common assets available for convert."""
    return {
        "assets": ["USDT", "BTC", "ETH", "BNB", "SOL", "XRP", "ADA", "DOGE", "T4PRO"],
    }


@router.post("/quote")
async def quote_convert(body: ConvertQuoteRequest):
    try:
        amount = Decimal(body.from_amount)
    except (InvalidOperation, ValueError):
        raise HTTPException(status_code=400, detail="Invalid amount")
    try:
        return await get_convert_quote(body.from_asset, body.to_asset, amount)
    except ConvertError as e:
        raise HTTPException(status_code=400, detail=e.message)


@router.post("/execute", dependencies=[Depends(require_trading_enabled)])
async def execute(
    body: ConvertExecuteRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.kyc_status != "approved":
        raise HTTPException(status_code=403, detail="KYC verification required for convert.")
    try:
        amount = Decimal(body.from_amount)
    except (InvalidOperation, ValueError):
        raise HTTPException(status_code=400, detail="Invalid amount")
    try:
        result = await execute_convert(db, user.id, body.from_asset, body.to_asset, amount)
        await db.commit()
    except ConvertError as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=e.message)
    return result
