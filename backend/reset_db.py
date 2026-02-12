"""Drop all tables and recreate them with the fixed schema."""
import asyncio
from app.database import engine, Base
# Import all models so they register with Base.metadata
from app.models import user, ledger, trading, campaign, wallet, cms  # noqa


async def reset():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        print("Dropped all tables.")
        await conn.run_sync(Base.metadata.create_all)
        print("Created all tables.")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(reset())
