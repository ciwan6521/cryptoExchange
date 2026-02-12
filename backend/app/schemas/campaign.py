"""Pydantic schemas for campaign endpoints."""

from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from decimal import Decimal


class CampaignResponse(BaseModel):
    id: UUID
    name: str
    description: Optional[str] = None
    campaign_type: str
    status: str
    start_date: str
    end_date: str
    target_segment: str
    reward_amount: str
    reward_asset: str
    percent_based: bool
    max_per_user: str
    min_requirement: str
    total_budget: str
    spent_budget: str
    applicable_pairs: Optional[list[str]] = None
    daily_cap: str
    total_cap: str
    auto_apply: bool
    one_time_only: bool
    participant_count: int
    claimed_count: int

    class Config:
        from_attributes = True


class CampaignListResponse(BaseModel):
    campaigns: list[CampaignResponse]


class CampaignClaimResponse(BaseModel):
    id: UUID
    campaign_id: UUID
    status: str
    trigger_event: str
    reward_amount: str
    reward_asset: str
    claimed_at: Optional[str] = None
    created_at: str

    class Config:
        from_attributes = True


class MyClaimsResponse(BaseModel):
    claims: list[CampaignClaimResponse]


class CreateCampaignRequest(BaseModel):
    name: str
    description: Optional[str] = None
    campaign_type: str
    start_date: str
    end_date: str
    target_segment: str = "all"
    reward_amount: str
    reward_asset: str = "USDT"
    percent_based: bool = False
    max_per_user: str = "0"
    min_requirement: str = "0"
    total_budget: str = "0"
    applicable_pairs: Optional[list[str]] = None
    daily_cap: str = "0"
    total_cap: str = "0"
    auto_apply: bool = True
    one_time_only: bool = True


class UpdateCampaignRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    target_segment: Optional[str] = None
    reward_amount: Optional[str] = None
    reward_asset: Optional[str] = None
    percent_based: Optional[bool] = None
    max_per_user: Optional[str] = None
    min_requirement: Optional[str] = None
    total_budget: Optional[str] = None
    applicable_pairs: Optional[list[str]] = None
    daily_cap: Optional[str] = None
    total_cap: Optional[str] = None
    auto_apply: Optional[bool] = None
    one_time_only: Optional[bool] = None
