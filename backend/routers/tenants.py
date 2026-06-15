"""Tenant Management routes (super_admin only)"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List
from datetime import datetime, timezone

from database import db
from models import Tenant, TenantCreate, TenantUpdate, TenantResponse
from auth import require_super_admin, require_admin, require_auth

router = APIRouter(prefix="/tenants", tags=["Tenants"])


@router.get("/my")
async def get_my_tenant(user: dict = Depends(require_auth)):
    """Get current user's own tenant info (any authenticated user)"""
    tenant_id = user.get("tenant_id")
    if not tenant_id:
        return None
    t = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
    if not t:
        return None
    return {"id": t["id"], "name": t["name"], "slug": t.get("slug", "")}


@router.get("", response_model=List[TenantResponse])
async def get_tenants(user: dict = Depends(require_super_admin)):
    """List all tenants with usage stats (super_admin only)"""
    tenants = await db.tenants.find({}, {"_id": 0}).to_list(500)
    result = []
    for t in tenants:
        tid = t["id"]
        store_count = await db.stores.count_documents({"tenant_id": tid})
        camera_count = await db.cameras.count_documents({"tenant_id": tid})
        user_count = await db.users.count_documents({"tenant_id": tid})
        result.append(TenantResponse(
            **t,
            store_count=store_count,
            camera_count=camera_count,
            user_count=user_count,
        ))
    return result


@router.post("", response_model=Tenant)
async def create_tenant(input: TenantCreate, user: dict = Depends(require_super_admin)):
    """Create new tenant (super_admin only)"""
    existing = await db.tenants.find_one({"slug": input.slug})
    if existing:
        raise HTTPException(status_code=400, detail="Bu slug zaten kullanımda")

    tenant = Tenant(**input.model_dump())
    doc = tenant.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.tenants.insert_one(doc)
    return tenant


@router.get("/{tenant_id}", response_model=TenantResponse)
async def get_tenant(tenant_id: str, user: dict = Depends(require_super_admin)):
    """Get single tenant with stats (super_admin only)"""
    t = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Tenant bulunamadı")
    store_count = await db.stores.count_documents({"tenant_id": tenant_id})
    camera_count = await db.cameras.count_documents({"tenant_id": tenant_id})
    user_count = await db.users.count_documents({"tenant_id": tenant_id})
    return TenantResponse(**t, store_count=store_count, camera_count=camera_count, user_count=user_count)


@router.put("/{tenant_id}", response_model=Tenant)
async def update_tenant(tenant_id: str, input: TenantUpdate, user: dict = Depends(require_super_admin)):
    """Update tenant (super_admin only)"""
    t = await db.tenants.find_one({"id": tenant_id})
    if not t:
        raise HTTPException(status_code=404, detail="Tenant bulunamadı")

    update_data = {k: v for k, v in input.model_dump().items() if v is not None}
    if "slug" in update_data:
        dup = await db.tenants.find_one({"slug": update_data["slug"], "id": {"$ne": tenant_id}})
        if dup:
            raise HTTPException(status_code=400, detail="Bu slug zaten kullanımda")

    if update_data:
        await db.tenants.update_one({"id": tenant_id}, {"$set": update_data})

    updated = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
    return Tenant(**updated)


@router.delete("/{tenant_id}")
async def delete_tenant(tenant_id: str, user: dict = Depends(require_super_admin)):
    """Delete tenant and all related data (super_admin only)"""
    t = await db.tenants.find_one({"id": tenant_id})
    if not t:
        raise HTTPException(status_code=404, detail="Tenant bulunamadı")

    # Cascade delete all tenant data
    await db.stores.delete_many({"tenant_id": tenant_id})
    await db.cameras.delete_many({"tenant_id": tenant_id})
    await db.users.delete_many({"tenant_id": tenant_id})
    await db.regions.delete_many({"tenant_id": tenant_id})
    await db.cities.delete_many({"tenant_id": tenant_id})
    await db.districts.delete_many({"tenant_id": tenant_id})
    await db.vms_servers.delete_many({"tenant_id": tenant_id})
    await db.settings.delete_many({"tenant_id": tenant_id})
    await db.scheduled_reports.delete_many({"tenant_id": tenant_id})
    await db.tenants.delete_one({"id": tenant_id})

    return {"message": "Tenant ve tüm verileri silindi"}


@router.get("/{tenant_id}/stats")
async def get_tenant_stats(tenant_id: str, user: dict = Depends(require_super_admin)):
    """Detailed usage stats for a tenant"""
    t = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Tenant bulunamadı")

    store_count = await db.stores.count_documents({"tenant_id": tenant_id})
    camera_count = await db.cameras.count_documents({"tenant_id": tenant_id})
    user_count = await db.users.count_documents({"tenant_id": tenant_id})
    snapshot_count = await db.counter_snapshots.count_documents({"tenant_id": tenant_id})

    return {
        "tenant": t,
        "usage": {
            "stores": store_count,
            "cameras": camera_count,
            "users": user_count,
            "snapshots": snapshot_count,
            "store_limit": t.get("max_stores", 10),
            "camera_limit": t.get("max_cameras", 50),
            "store_usage_pct": round(store_count / max(t.get("max_stores", 10), 1) * 100),
            "camera_usage_pct": round(camera_count / max(t.get("max_cameras", 50), 1) * 100),
        }
    }
