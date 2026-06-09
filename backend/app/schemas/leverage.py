from pydantic import BaseModel, Field


class OpenLeverageRequest(BaseModel):
    symbol: str = Field(min_length=3, max_length=20)
    side: str = Field(min_length=4, max_length=5)
    leverage: int = Field(ge=1, le=100)
    margin_usdt: str


class PartialCloseRequest(BaseModel):
    percent: int = Field(default=100, ge=1, le=100)


class AddMarginRequest(BaseModel):
    margin_usdt: str


class LeveragePositionResponse(BaseModel):
    id: str
    symbol: str
    base_asset: str
    quote_asset: str
    side: str
    leverage: int
    margin_usdt: str
    notional_usdt: str
    quantity: str
    entry_price: str
    liquidation_price: str
    mark_price: str | None = None
    unrealized_pnl: str | None = None
    roi_percent: str | None = None
    status: str
    opened_at: str
    closed_at: str | None = None
    close_price: str | None = None
    realized_pnl: str | None = None
