import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext

async def create_admin():
    client = AsyncIOMotorClient('mongodb://mongodb:27017')
    db = client.vms360
    pwd = CryptContext(schemes=['bcrypt']).hash('admin123')
    await db.users.update_one(
        {'username': 'admin'},
        {'$set': {'username': 'admin', 'password_hash': pwd, 'role': 'admin', 'is_active': True}},
        upsert=True
    )
    print('Admin olusturuldu!')
    client.close()

asyncio.run(create_admin())