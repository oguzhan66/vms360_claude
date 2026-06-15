"""
Migration script: single-tenant to multi-tenant.

Çalıştırma:
  cd backend && python migrate_tenant.py

Ne yapar:
  1. "default" tenant oluşturur (yoksa)
  2. Tüm mevcut collection'lardaki tenant_id=null kayıtlara default tenant'ın id'sini yazar
  3. Tüm kullanıcılara (super_admin hariç) default tenant atar
"""

import asyncio
import os
import sys
from pathlib import Path
from datetime import datetime, timezone

# Ensure backend package is importable
sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env", override=False)

from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

TENANT_NAME = "Varsayılan Müşteri"
TENANT_SLUG = "default"
TENANT_PLAN = "enterprise"
TENANT_MAX_STORES = 9999
TENANT_MAX_CAMERAS = 9999

# Collections that get tenant_id
TENANT_COLLECTIONS = [
    "stores",
    "cameras",
    "regions",
    "cities",
    "districts",
    "vms_servers",
    "settings",
    "scheduled_reports",
    "counter_snapshots",
    "queue_snapshots",
    "analytics_snapshots",
    "daily_summaries",
    "hourly_aggregates",
    "store_health",
    "alerts",
    "floors",
    "heatmap_zones",
]


async def run_migration():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    # 1. Create or fetch default tenant
    existing_tenant = await db.tenants.find_one({"slug": TENANT_SLUG})
    if existing_tenant:
        tenant_id = existing_tenant["id"]
        print(f"[OK] Default tenant already exists: {tenant_id}")
    else:
        import uuid
        tenant_id = str(uuid.uuid4())
        tenant_doc = {
            "id": tenant_id,
            "name": TENANT_NAME,
            "slug": TENANT_SLUG,
            "plan": TENANT_PLAN,
            "max_stores": TENANT_MAX_STORES,
            "max_cameras": TENANT_MAX_CAMERAS,
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.tenants.insert_one(tenant_doc)
        print(f"[+] Created default tenant: {tenant_id}")

    # 2. Migrate each collection
    for col_name in TENANT_COLLECTIONS:
        col = db[col_name]
        result = await col.update_many(
            {"$or": [{"tenant_id": {"$exists": False}}, {"tenant_id": None}, {"tenant_id": ""}]},
            {"$set": {"tenant_id": tenant_id}},
        )
        if result.modified_count > 0:
            print(f"[+] {col_name}: {result.modified_count} documents updated")
        else:
            print(f"[-] {col_name}: no documents needed migration")

    # 3. Migrate users (skip super_admin)
    user_result = await db.users.update_many(
        {
            "role": {"$ne": "super_admin"},
            "$or": [{"tenant_id": {"$exists": False}}, {"tenant_id": None}, {"tenant_id": ""}],
        },
        {"$set": {"tenant_id": tenant_id}},
    )
    print(f"[+] users: {user_result.modified_count} documents updated")

    # 4. Report
    print("\n=== Migration Summary ===")
    store_count = await db.stores.count_documents({"tenant_id": tenant_id})
    cam_count = await db.cameras.count_documents({"tenant_id": tenant_id})
    user_count = await db.users.count_documents({"tenant_id": tenant_id})
    print(f"Tenant '{TENANT_SLUG}' ({tenant_id}):")
    print(f"  Stores  : {store_count}")
    print(f"  Cameras : {cam_count}")
    print(f"  Users   : {user_count}")
    print("\nMigration complete!")

    client.close()


if __name__ == "__main__":
    asyncio.run(run_migration())
