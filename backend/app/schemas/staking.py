"""Pydantic schemas for staking endpoints."""

from pydantic import BaseModel, Field
from typing import Optional
from uuid import UUID


class StakingPeriodInput(BaseModel):
    label: str = Field(min_length=1, max_length=50)
    duration_days: int = Field(gt=0, le=3650)
    reward_percent: str = Field(description="Total return % for this lock period")
    is_active: bool = True
    sort_order: int = 0


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
