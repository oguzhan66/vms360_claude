"""Store Management routes"""
from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional

from database import db
from models import Store, StoreCreate, StoreUpdate

router = APIRouter(prefix="/stores", tags=["Stores"])


@router.post("", response_model=Store)
async def create_store(input: StoreCreate):
    store = Store(**input.model_dump())
    doc = store.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.stores.insert_one(doc)
    return store


@router.get("", response_model=List[Store])
async def get_stores(
    region_id: Optional[str] = Query(None),
    city_id: Optional[str] = Query(None),
    district_id: Optional[str] = Query(None)
):
    query = {}
    
    if district_id:
        query["district_id"] = district_id
    elif city_id:
        # Get all districts in this city
        districts = await db.districts.find({"city_id": city_id}, {"_id": 0}).to_list(100)
        district_ids = [d["id"] for d in districts]
        if district_ids:
            query["district_id"] = {"$in": district_ids}
    elif region_id:
        # Get all cities in this region, then all districts
        cities = await db.cities.find({"region_id": region_id}, {"_id": 0}).to_list(100)
        city_ids = [c["id"] for c in cities]
        districts = await db.districts.find({"city_id": {"$in": city_ids}}, {"_id": 0}).to_list(500)
        district_ids = [d["id"] for d in districts]
        if district_ids:
            query["district_id"] = {"$in": district_ids}
    
    stores = await db.stores.find(query, {"_id": 0}).to_list(500)
    return stores


@router.get("/{store_id}", response_model=Store)
async def get_store(store_id: str):
    store = await db.stores.find_one({"id": store_id}, {"_id": 0})
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    return store


@router.put("/{store_id}", response_model=Store)
async def update_store(store_id: str, input: StoreUpdate):
    update_data = {k: v for k, v in input.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    result = await db.stores.update_one({"id": store_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Store not found")
    return await get_store(store_id)


@router.delete("/{store_id}")
async def delete_store(store_id: str):
    result = await db.stores.delete_one({"id": store_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Store not found")
    return {"status": "deleted"}
