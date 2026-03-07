import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def f():
    db = AsyncIOMotorClient('mongodb://mongodb:27017').vms360
    await db.users.update_one(
        {'username': 'admin'},
        {'$set': {
            'id': 'admin-001',
            'full_name': 'Sistem Yoneticisi',
            'allowed_region_ids': [],
            'allowed_city_ids': [],
            'allowed_store_ids': []
        }}
    )
    print('Tamam')

asyncio.run(f())
