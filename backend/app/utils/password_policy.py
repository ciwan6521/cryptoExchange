"""
Password policy enforcement for users and admins.

Rules:
- Minimum 8 characters (12 for admins)
- At least 1 uppercase letter
- At least 1 lowercase letter
- At least 1 digit
- At least 1 special character
- Not in common password list
"""

import re

COMMON_PASSWORDS = {
    "password", "12345678", "123456789", "qwerty123", "password1",
    "iloveyou", "admin123", "welcome1", "monkey123", "dragon123",
    "master123", "letmein12", "abc12345", "football1", "shadow123",
    "trustno1", "password123", "changeme", "crypto4pro", "crypto123",
}


def validate_password(password: str, is_admin: bool = False) -> list[str]:
    """
    Validate password against policy. Returns list of violations (empty = valid).
    """
    errors = []
    min_len = 12 if is_admin else 8

    if len(password) < min_len:
        errors.append(f"Password must be at least {min_len} characters")

    if not re.search(r"[A-Z]", password):
        errors.append("Password must contain at least one uppercase letter")

    if not re.search(r"[a-z]", password):
        errors.append("Password must contain at least one lowercase letter")

    if not re.search(r"\d", password):
        errors.append("Password must contain at least one digit")

    if not re.search(r"[!@#$%^&*()_+\-=\[\]{};':\"\\|,.<>/?`~]", password):
        errors.append("Password must contain at least one special character")

    if password.lower() in COMMON_PASSWORDS:
        errors.append("Password is too common")

    return errors
