import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext

async def f():
    db = AsyncIOMotorClient('mongodb://mongodb:27017').vms360
    pwd = CryptContext(schemes=['bcrypt']).hash('12.345qwert')
    await db.users.update_one({'username': 'admin'}, {'$set': {'password_hash': pwd}})
    print('Şifre değiştirildi!')

asyncio.run(f())

