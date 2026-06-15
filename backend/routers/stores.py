"""Store Management routes"""
from fastapi import APIRouter, HTTPException, Query, Depends, Header
from typing import List, Optional
from pydantic import BaseModel

from database import db
from models import Store, StoreCreate, StoreUpdate
from auth import require_auth, resolve_tenant_filter, resolve_tenant_id

router = APIRouter(prefix="/stores", tags=["Stores"])


class GroupRenameRequest(BaseModel):
    new_name: str


@router.post("")
async def create_store(
    input: StoreCreate,
    user: dict = Depends(require_auth),
    x_tenant_id: Optional[str] = Header(None),
):
    tenant_id = resolve_tenant_id(user, x_tenant_id)
    data = input.model_dump()
    data["tenant_id"] = tenant_id

    # Enforce store limit
    if tenant_id:
        tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
        if tenant:
            current_count = await db.stores.count_documents({"tenant_id": tenant_id})
            if current_count >= tenant.get("max_stores", 10):
                raise HTTPException(
                    status_code=400,
                    detail=f"Maksimum mağaza limitine ulaşıldı ({tenant.get('max_stores', 10)})"
                )

    store = Store(**data)
    doc = store.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.stores.insert_one(doc)
    return store


@router.get("")
async def get_stores(
    region_id: Optional[str] = Query(None),
    city_id: Optional[str] = Query(None),
    district_id: Optional[str] = Query(None),
    user: dict = Depends(require_auth),
    x_tenant_id: Optional[str] = Header(None),
):
    query = resolve_tenant_filter(user, x_tenant_id)

    if district_id:
        query["district_id"] = district_id
    elif city_id:
        districts = await db.districts.find({"city_id": city_id}, {"_id": 0}).to_list(100)
        district_ids = [d["id"] for d in districts]
        if district_ids:
            query["district_id"] = {"$in": district_ids}
    elif region_id:
        cities = await db.cities.find({"region_id": region_id}, {"_id": 0}).to_list(100)
        city_ids = [c["id"] for c in cities]
        districts = await db.districts.find({"city_id": {"$in": city_ids}}, {"_id": 0}).to_list(500)
        district_ids = [d["id"] for d in districts]
        if district_ids:
            query["district_id"] = {"$in": district_ids}

    stores = await db.stores.find(query, {"_id": 0}).to_list(500)
    return stores


@router.get("/{store_id}")
async def get_store(store_id: str, user: dict = Depends(require_auth), x_tenant_id: Optional[str] = Header(None)):
    query = {"id": store_id, **resolve_tenant_filter(user, x_tenant_id)}
    store = await db.stores.find_one(query, {"_id": 0})
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    return store


@router.put("/{store_id}")
async def update_store(store_id: str, input: StoreUpdate, user: dict = Depends(require_auth), x_tenant_id: Optional[str] = Header(None)):
    query = {"id": store_id, **resolve_tenant_filter(user, x_tenant_id)}
    update_data = {k: v for k, v in input.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    result = await db.stores.update_one(query, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Store not found")
    return await get_store(store_id, user, x_tenant_id)


@router.delete("/{store_id}")
async def delete_store(store_id: str, user: dict = Depends(require_auth), x_tenant_id: Optional[str] = Header(None)):
    query = {"id": store_id, **resolve_tenant_filter(user, x_tenant_id)}
    result = await db.stores.delete_one(query)
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Store not found")
    return {"status": "deleted"}


@router.put("/groups/{old_name}")
async def rename_store_group(old_name: str, req: GroupRenameRequest, user: dict = Depends(require_auth), x_tenant_id: Optional[str] = Header(None)):
    query = {"group_name": old_name, **resolve_tenant_filter(user, x_tenant_id)}
    result = await db.stores.update_many(query, {"$set": {"group_name": req.new_name.strip()}})
    return {"updated": result.modified_count}


@router.delete("/groups/{old_name}")
async def delete_store_group(old_name: str, user: dict = Depends(require_auth), x_tenant_id: Optional[str] = Header(None)):
    query = {"group_name": old_name, **resolve_tenant_filter(user, x_tenant_id)}
    result = await db.stores.update_many(query, {"$unset": {"group_name": ""}})
    return {"updated": result.modified_count}
