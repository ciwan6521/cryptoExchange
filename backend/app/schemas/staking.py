"""Pydantic schemas for staking endpoints."""

from decimal import Decimal, InvalidOperation

from pydantic import BaseModel, Field, field_validator
from typing import Optional
from uuid import UUID


def _normalize_decimal_input(value: str) -> str:
    return value.strip().replace(",", ".").rstrip("%").strip()


class StakingPeriodInput(BaseModel):
    label: str = Field(min_length=1, max_length=50)
    duration_days: int = Field(gt=0, le=3650)
    reward_percent: str = Field(min_length=1, description="Total return % for this lock period")
    is_active: bool = True
    sort_order: int = 0

    @field_validator("label")
    @classmethod
    def strip_label(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Period label is required")
        return v

    @field_validator("reward_percent")
    @classmethod
    def validate_reward_percent(cls, v: str) -> str:
        normalized = _normalize_decimal_input(v)
        if not normalized:
            raise ValueError("Return % is required")
        try:
            amount = Decimal(normalized)
            if amount < 0:
                raise ValueError
        except (InvalidOperation, ValueError):
            raise ValueError("Return % must be a valid number (e.g. 5 or 7.5)")
        return normalized


class StakingPeriodResponse(BaseModel):
    id: UUID
    label: str
    duration_days: int
    reward_percent: str
    is_active: bool
    sort_order: int


class CreateStakingProductRequest(BaseModel):
    asset: str = Field(min_length=1, max_length=20)
    name: str = Field(min_length=1, max_length=100)
    description: Optional[str] = None
    min_stake: Optional[str] = None
    is_active: bool = True
    sort_order: int = 0
    periods: list[StakingPeriodInput] = Field(min_length=1)

    @field_validator("asset", "name")
    @classmethod
    def strip_required_text(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("This field is required")
        return v

    @field_validator("min_stake")
    @classmethod
    def validate_min_stake(cls, v: Optional[str]) -> Optional[str]:
        if v is None or not str(v).strip():
            return None
        normalized = _normalize_decimal_input(str(v))
        if not normalized:
            return None
        try:
            amount = Decimal(normalized)
            if amount < 0:
                raise ValueError
        except (InvalidOperation, ValueError):
            raise ValueError("Min stake must be a valid number (e.g. 10 or 0.5)")
        return normalized


class UpdateStakingProductRequest(BaseModel):
    asset: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    min_stake: Optional[str] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None
    periods: Optional[list[StakingPeriodInput]] = None


class StakingProductResponse(BaseModel):
    id: UUID
    asset: str
    name: str
    description: Optional[str]
    min_stake: Optional[str]
    is_active: bool
    sort_order: int
    periods: list[StakingPeriodResponse]
    created_at: str


class StakeRequest(BaseModel):
    product_id: UUID
    period_id: UUID
    amount: str


class StakingPositionResponse(BaseModel):
    id: UUID
    asset: str
    product_name: str
    amount: str
    reward_percent: str
    expected_reward: str
    period_label: str
    duration_days: int
    started_at: str
    unlock_at: str
    claimed_at: Optional[str]
    status: str
    can_claim: bool
