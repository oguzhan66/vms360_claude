"""Location Management routes (Regions, Cities, Districts)"""
from fastapi import APIRouter, HTTPException, Query, Depends, Header
from typing import List, Optional

from database import db
from models import Region, City, District, LocationCreate
from auth import require_auth, resolve_tenant_filter, resolve_tenant_id

router = APIRouter(tags=["Locations"])


# ============== REGIONS ==============

@router.post("/regions", response_model=Region)
async def create_region(input: LocationCreate, user: dict = Depends(require_auth), x_tenant_id: Optional[str] = Header(None)):
    tenant_id = resolve_tenant_id(user, x_tenant_id)
    region = Region(name=input.name, tenant_id=tenant_id)
    doc = region.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.regions.insert_one(doc)
    return region


@router.get("/regions", response_model=List[Region])
async def get_regions(user: dict = Depends(require_auth)):
    regions = await db.regions.find({}, {"_id": 0}).to_list(100)
    return regions


@router.delete("/regions/{region_id}")
async def delete_region(region_id: str, user: dict = Depends(require_auth), x_tenant_id: Optional[str] = Header(None)):
    query = {"id": region_id, **resolve_tenant_filter(user, x_tenant_id)}
    result = await db.regions.delete_one(query)
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Region not found")
    return {"status": "deleted"}


# ============== CITIES ==============

@router.post("/cities", response_model=City)
async def create_city(input: LocationCreate, user: dict = Depends(require_auth), x_tenant_id: Optional[str] = Header(None)):
    if not input.parent_id:
        raise HTTPException(status_code=400, detail="parent_id (region_id) is required")
    tenant_id = resolve_tenant_id(user, x_tenant_id)
    city = City(name=input.name, region_id=input.parent_id, tenant_id=tenant_id)
    doc = city.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.cities.insert_one(doc)
    return city


@router.get("/cities", response_model=List[City])
async def get_cities(region_id: Optional[str] = Query(None), user: dict = Depends(require_auth)):
    query = {}
    if region_id:
        query["region_id"] = region_id
    cities = await db.cities.find(query, {"_id": 0}).to_list(100)
    return cities


@router.delete("/cities/{city_id}")
async def delete_city(city_id: str, user: dict = Depends(require_auth), x_tenant_id: Optional[str] = Header(None)):
    query = {"id": city_id, **resolve_tenant_filter(user, x_tenant_id)}
    result = await db.cities.delete_one(query)
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="City not found")
    return {"status": "deleted"}


# ============== DISTRICTS ==============

@router.post("/districts", response_model=District)
async def create_district(input: LocationCreate, user: dict = Depends(require_auth), x_tenant_id: Optional[str] = Header(None)):
    if not input.parent_id:
        raise HTTPException(status_code=400, detail="parent_id (city_id) is required")
    tenant_id = resolve_tenant_id(user, x_tenant_id)
    district = District(name=input.name, city_id=input.parent_id, tenant_id=tenant_id)
    doc = district.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.districts.insert_one(doc)
    return district


@router.get("/districts", response_model=List[District])
async def get_districts(city_id: Optional[str] = Query(None), user: dict = Depends(require_auth)):
    query = {}
    if city_id:
        query["city_id"] = city_id
    districts = await db.districts.find(query, {"_id": 0}).to_list(100)
    return districts


@router.delete("/districts/{district_id}")
async def delete_district(district_id: str, user: dict = Depends(require_auth), x_tenant_id: Optional[str] = Header(None)):
    query = {"id": district_id, **resolve_tenant_filter(user, x_tenant_id)}
    result = await db.districts.delete_one(query)
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="District not found")
    return {"status": "deleted"}


# ============== HIERARCHY ==============

@router.get("/hierarchy")
async def get_hierarchy(user: dict = Depends(require_auth), x_tenant_id: Optional[str] = Header(None)):
    """Get complete location hierarchy — regions/cities/districts are global, stores are tenant-scoped"""
    regions = await db.regions.find({}, {"_id": 0}).to_list(100)
    cities = await db.cities.find({}, {"_id": 0}).to_list(500)
    districts = await db.districts.find({}, {"_id": 0}).to_list(1000)
    stores = await db.stores.find(resolve_tenant_filter(user, x_tenant_id), {"_id": 0}).to_list(500)

    hierarchy = []
    for region in regions:
        region_data = {"id": region["id"], "name": region["name"], "type": "region", "cities": []}
        region_cities = [c for c in cities if c.get("region_id") == region["id"]]
        for city in region_cities:
            city_data = {"id": city["id"], "name": city["name"], "type": "city", "districts": []}
            city_districts = [d for d in districts if d.get("city_id") == city["id"]]
            for district in city_districts:
                district_stores = [s for s in stores if s.get("district_id") == district["id"]]
                city_data["districts"].append({
                    "id": district["id"],
                    "name": district["name"],
                    "type": "district",
                    "store_count": len(district_stores),
                })
            region_data["cities"].append(city_data)
        hierarchy.append(region_data)

    return {"hierarchy": hierarchy}
