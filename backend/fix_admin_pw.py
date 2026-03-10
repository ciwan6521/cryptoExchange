import asyncio, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from app.database import async_session_factory
from app.models.user import AdminUser
from app.utils.security import hash_password, verify_password
from sqlalchemy import select

async def go():
    async with async_session_factory() as db:
        r = await db.execute(select(AdminUser).where(AdminUser.email == "admin@crypto4.io"))
        a = r.scalar_one_or_none()
        if a:
            if not verify_password("Admin123!", a.password_hash):
                a.password_hash = hash_password("Admin123!")
                await db.commit()
                print("Password updated")
            else:
                print("Password already correct")
        else:
            print("Admin not found")

asyncio.run(go())
