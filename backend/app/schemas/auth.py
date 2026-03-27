"""Pydantic schemas for auth endpoints."""

from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from uuid import UUID


class RegisterRequest(BaseModel):
    email: EmailStr
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    totp_code: Optional[str] = None


class AdminLoginRequest(BaseModel):
    email: EmailStr
    password: str
    totp_code: Optional[str] = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: UUID
    email: str
    username: str
    is_active: bool
    is_verified: bool
    email_verified: bool
    kyc_status: str
    member_tier: str
    trading_enabled: bool
    withdrawals_enabled: bool
    totp_enabled: bool
    created_at: str

    class Config:
        from_attributes = True


class AuthResponse(BaseModel):
    user: UserResponse
    access_token: str
    token_type: str = "bearer"


class AdminUserResponse(BaseModel):
    id: UUID
    email: str
    username: str
    role: str
    is_active: bool
    totp_enabled: bool

    class Config:
        from_attributes = True


class AdminAuthResponse(BaseModel):
    """Legacy — kept for backwards compatibility."""
    admin: AdminUserResponse
    access_token: str
    token_type: str = "bearer"


class AdminLoginResponse(BaseModel):
    """Admin login response — token is in httpOnly cookie, not in body."""
    admin: AdminUserResponse


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    password: str = Field(min_length=8, max_length=128)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class UpdateProfileRequest(BaseModel):
    username: Optional[str] = Field(None, min_length=3, max_length=50)


class SessionResponse(BaseModel):
    id: str
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    created_at: str
    is_current: bool = False
