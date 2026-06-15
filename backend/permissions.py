"""Permission utilities for store-based access control (tenant-aware)"""
from typing import List, Optional, Set
from database import db
from auth import get_tenant_filter


async def get_user_allowed_stores(user: dict) -> Optional[Set[str]]:
    """
    Get list of store IDs that user has access to within their tenant.
    Returns None if user has access to all stores (admin/super_admin with no restrictions).
    Returns set of store IDs if user has restricted access.
    """
    db_user = await db.users.find_one({"username": user["username"], "tenant_id": user.get("tenant_id")}, {"_id": 0})
    if not db_user:
        return set()

    role = db_user.get("role", "operator")
    tenant_id = db_user.get("tenant_id")

    # super_admin has full access across all tenants
    if role == "super_admin":
        return None

    # Admin with no restrictions has full access within their own tenant only
    if role == "admin":
        allowed_regions = db_user.get("allowed_region_ids", [])
        allowed_cities = db_user.get("allowed_city_ids", [])
        allowed_stores_list = db_user.get("allowed_store_ids", [])
        if not allowed_regions and not allowed_cities and not allowed_stores_list:
            if tenant_id:
                tenant_stores = await db.stores.find({"tenant_id": tenant_id}, {"_id": 0, "id": 1}).to_list(500)
                return {s["id"] for s in tenant_stores}
            return None

    # For operators or restricted admins, calculate allowed stores
    allowed_regions = db_user.get("allowed_region_ids", [])
    allowed_cities = db_user.get("allowed_city_ids", [])
    allowed_stores = set(db_user.get("allowed_store_ids", []))

    # Operator with no permissions set → no access
    if role == "operator" and not allowed_regions and not allowed_cities and not allowed_stores:
        return set()

    # Tenant filter for sub-queries
    tenant_filter = {"tenant_id": tenant_id} if tenant_id else {}

    # Get cities from allowed regions
    if allowed_regions:
        region_cities = await db.cities.find(
            {"region_id": {"$in": allowed_regions}, **tenant_filter},
            {"_id": 0, "id": 1},
        ).to_list(500)
        allowed_cities = list(set(allowed_cities + [c["id"] for c in region_cities]))

    # Get districts from allowed cities
    district_ids = []
    if allowed_cities:
        city_districts = await db.districts.find(
            {"city_id": {"$in": allowed_cities}, **tenant_filter},
            {"_id": 0, "id": 1},
        ).to_list(1000)
        district_ids = [d["id"] for d in city_districts]

    # Get stores from districts
    if district_ids:
        district_stores = await db.stores.find(
            {"district_id": {"$in": district_ids}, **tenant_filter},
            {"_id": 0, "id": 1},
        ).to_list(1000)
        allowed_stores.update(s["id"] for s in district_stores)

    return allowed_stores


async def filter_stores_by_permission(stores: List[dict], user: dict) -> List[dict]:
    """Filter store list based on user permissions"""
    allowed = await get_user_allowed_stores(user)
    if allowed is None:
        return stores
    return [s for s in stores if s.get("id") in allowed or s.get("store_id") in allowed]


async def check_store_access(store_id: str, user: dict) -> bool:
    """Check if user has access to a specific store"""
    allowed = await get_user_allowed_stores(user)
    if allowed is None:
        return True
    return store_id in allowed


async def get_user_store_filter(user: dict) -> dict:
    """Get MongoDB filter for stores based on user permissions (tenant-scoped)"""
    tenant_filter = get_tenant_filter(user)
    allowed = await get_user_allowed_stores(user)

    if allowed is None:
        return tenant_filter

    store_id_filter = {"id": {"$in": list(allowed)}} if allowed else {"id": {"$in": []}}
    return {**tenant_filter, **store_id_filter}


async def get_user_permissions_summary(user: dict) -> dict:
    """Get summary of user permissions for frontend"""
    db_user = await db.users.find_one({"username": user["username"], "tenant_id": user.get("tenant_id")}, {"_id": 0})
    if not db_user:
        return {"has_full_access": False, "allowed_stores": []}

    allowed_stores = await get_user_allowed_stores(user)

    return {
        "has_full_access": allowed_stores is None,
        "allowed_region_ids": db_user.get("allowed_region_ids", []),
        "allowed_city_ids": db_user.get("allowed_city_ids", []),
        "allowed_store_ids": db_user.get("allowed_store_ids", []),
        "computed_store_ids": list(allowed_stores) if allowed_stores is not None else [],
    }
