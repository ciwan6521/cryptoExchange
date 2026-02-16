"""Create a test admin user for quick testing."""
import asyncio
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from app.database import async_session_factory
from app.models.user import AdminUser
from app.utils.security import hash_password
import uuid

async def create_admin():
    async with async_session_factory() as db:
        # Check if admin exists
        from sqlalchemy import select
        result = await db.execute(
            select(AdminUser).where(AdminUser.email == "admin@nexus.com")
        )
        existing = result.scalar_one_or_none()
        
        if existing:
            print("[!] Admin already exists: admin@nexus.com")
            return
        
        # Create admin
        admin = AdminUser(
            id=uuid.uuid4(),
            email="admin@nexus.com",
            username="admin",
            password_hash=hash_password("Admin123!"),
            role="super_admin",
            is_active=True,
            totp_enabled=False,
        )
        db.add(admin)
        await db.commit()
        print("[+] Created admin: admin@nexus.com / Admin123!")

if __name__ == "__main__":
    asyncio.run(create_admin())
