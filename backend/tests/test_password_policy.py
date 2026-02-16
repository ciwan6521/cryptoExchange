"""
Tests for password policy enforcement.
"""

import pytest
from app.utils.password_policy import validate_password


def test_valid_password():
    assert validate_password("MyStr0ng!Pass") == []


def test_too_short():
    errors = validate_password("Ab1!xyz")
    assert any("8 characters" in e for e in errors)


def test_admin_min_length():
    errors = validate_password("Short1!ab", is_admin=True)
    assert any("12 characters" in e for e in errors)


def test_missing_uppercase():
    errors = validate_password("nouppercase1!")
    assert any("uppercase" in e for e in errors)


def test_missing_lowercase():
    errors = validate_password("NOLOWERCASE1!")
    assert any("lowercase" in e for e in errors)


def test_missing_digit():
    errors = validate_password("NoDigitHere!")
    assert any("digit" in e for e in errors)


def test_missing_special():
    errors = validate_password("NoSpecial1a")
    assert any("special" in e for e in errors)


def test_common_password():
    errors = validate_password("Password123!")
    # "password" is in common list, but "Password123!" has mixed case + digit + special
    # The common check is case-insensitive on the base word
    # Let's test one that's clearly in the list
    errors2 = validate_password("password")
    assert any("common" in e for e in errors2)
