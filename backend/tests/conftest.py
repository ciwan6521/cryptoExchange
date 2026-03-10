"""
Shared test fixtures for Crypto4Pro tests.

Uses an in-memory SQLite database for fast, isolated tests.
Each test gets a fresh database with all tables created.
"""

import uuid
import asyncio
import pytest
import pytest_asyncio
from decimal import Decimal
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import event

from app.database import Base

# Use SQLite for tests (async via aiosqlite)
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture(scope="session")
def event_loop():
    """Create a single event loop for the entire test session."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture
async def engine():
    """Create a fresh async engine for each test."""
    eng = create_async_engine(TEST_DATABASE_URL, echo=False)

    # SQLite needs special handling for foreign keys
    @event.listens_for(eng.sync_engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield eng

    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await eng.dispose()


@pytest_asyncio.fixture
async def db(engine):
    """Provide an async database session for each test."""
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def sample_user(db):
    """Create a sample user for testing."""
    from app.models.user import User
    from app.utils.security import hash_password

    user = User(
        id=uuid.uuid4(),
        email="testuser@example.com",
        username="testuser",
        password_hash=hash_password("TestPass123!"),
        is_active=True,
        trading_enabled=True,
        withdrawals_enabled=True,
        last_login_at=datetime.now(timezone.utc),
    )
    db.add(user)
    await db.flush()
    return user


@pytest_asyncio.fixture
async def sample_user2(db):
    """Create a second sample user for testing."""
    from app.models.user import User
    from app.utils.security import hash_password

    user = User(
        id=uuid.uuid4(),
        email="testuser2@example.com",
        username="testuser2",
        password_hash=hash_password("TestPass456!"),
        is_active=True,
        trading_enabled=True,
        withdrawals_enabled=True,
        last_login_at=datetime.now(timezone.utc),
    )
    db.add(user)
    await db.flush()
    return user


@pytest_asyncio.fixture
async def sample_pair(db):
    """Create a sample trading pair."""
    from app.models.trading import TradingPair

    pair = TradingPair(
        id=uuid.uuid4(),
        symbol="BTC-USDT",
        base_asset="BTC",
        quote_asset="USDT",
        price_precision=2,
        quantity_precision=6,
        tick_size=Decimal("0.01"),
        step_size=Decimal("0.000001"),
        min_order_size=Decimal("0.000001"),
        max_order_size=Decimal("100"),
        min_notional=Decimal("10"),
        maker_fee=Decimal("0.001"),
        taker_fee=Decimal("0.001"),
        is_enabled=True,
    )
    db.add(pair)
    await db.flush()
    return pair


@pytest_asyncio.fixture
async def funded_user(db, sample_user):
    """Create a user with funded USDT and BTC accounts."""
    from app.services.ledger_service import LedgerService

    ledger = LedgerService(db)

    # Credit 100,000 USDT
    await ledger.credit(
        user_id=sample_user.id,
        asset="USDT",
        amount=Decimal("100000"),
        category="test_credit",
        idempotency_key=f"test_fund_usdt:{sample_user.id}",
        description="Test funding",
    )

    # Credit 10 BTC
    await ledger.credit(
        user_id=sample_user.id,
        asset="BTC",
        amount=Decimal("10"),
        category="test_credit",
        idempotency_key=f"test_fund_btc:{sample_user.id}",
        description="Test funding",
    )

    await db.flush()
    return sample_user


@pytest_asyncio.fixture
async def funded_user2(db, sample_user2):
    """Create a second user with funded accounts."""
    from app.services.ledger_service import LedgerService

    ledger = LedgerService(db)

    await ledger.credit(
        user_id=sample_user2.id,
        asset="USDT",
        amount=Decimal("100000"),
        category="test_credit",
        idempotency_key=f"test_fund_usdt:{sample_user2.id}",
        description="Test funding",
    )

    await ledger.credit(
        user_id=sample_user2.id,
        asset="BTC",
        amount=Decimal("10"),
        category="test_credit",
        idempotency_key=f"test_fund_btc:{sample_user2.id}",
        description="Test funding",
    )

    await db.flush()
    return sample_user2
