"""User login lockout tests."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone, timedelta

from app.api.auth import login
from app.models.user import User
from app.config import settings


@pytest.mark.asyncio
async def test_login_lockout_after_max_attempts():
    user = User(
        id="00000000-0000-0000-0000-000000000099",
        email="locked@example.com",
        username="lockeduser",
        password_hash="$2b$12$dummy",
        is_active=True,
        failed_login_attempts=settings.MAX_LOGIN_ATTEMPTS - 1,
        locked_until=None,
    )

    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = user
    mock_db.execute.return_value = mock_result
    mock_db.commit = AsyncMock()

    body = MagicMock()
    body.email = "locked@example.com"
    body.password = "wrong"
    body.totp_code = None

    request = MagicMock()
    request.client.host = "127.0.0.1"
    request.headers.get.return_value = None
    response = MagicMock()

    with patch("app.api.auth.verify_password", return_value=False):
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc:
            await login(body, request, response, mock_db)
        assert exc.value.status_code == 401
