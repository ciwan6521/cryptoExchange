import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import asyncio
from sqlalchemy import text
from app.database import async_session_factory

async def go():
    async with async_session_factory() as db:
        await db.execute(text("DELETE FROM trades"))
        await db.execute(text("DELETE FROM orders"))
        await db.commit()
        print("Cleaned trades + orders")

asyncio.run(go())
