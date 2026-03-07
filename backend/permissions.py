"""Permission utilities for store-based access control"""
from typing import List, Optional, Set
from database import db


async def get_user_allowed_stores(user: dict) -> Optional[Set[str]]:
    """
    Get list of store IDs that user has access to.
    Returns None if user has access to all stores (admin with no restrictions).
    Returns set of store IDs if user has restricted access.
    """
    # Get full user data from database
    db_user = await db.users.find_one({"username": user["username"]}, {"_id": 0})
    if not db_user:
        return set()  # No access if user not found
    
    # Admin with no restrictions has access to all
    if db_user.get("role") == "admin":
        allowed_regions = db_user.get("allowed_region_ids", [])
        allowed_cities = db_user.get("allowed_city_ids", [])
        allowed_stores = db_user.get("allowed_store_ids", [])
        
        # If no restrictions set, return None (all access)
        if not allowed_regions and not allowed_cities and not allowed_stores:
            return None
    
    # For operators or restricted admins, calculate allowed stores
    allowed_regions = db_user.get("allowed_region_ids", [])
    allowed_cities = db_user.get("allowed_city_ids", [])
    allowed_stores = set(db_user.get("allowed_store_ids", []))
    
    # If operator has no permissions set, they have no access
    if db_user.get("role") == "operator" and not allowed_regions and not allowed_cities and not allowed_stores:
        return set()  # No access
    
    # Get cities from allowed regions
    if allowed_regions:
        region_cities = await db.cities.find(
            {"region_id": {"$in": allowed_regions}},
            {"_id": 0, "id": 1}
        ).to_list(500)
        allowed_cities = list(set(allowed_cities + [c["id"] for c in region_cities]))
    
    # Get districts from allowed cities
    district_ids = []
    if allowed_cities:
        city_districts = await db.districts.find(
            {"city_id": {"$in": allowed_cities}},
            {"_id": 0, "id": 1}
        ).to_list(1000)
        district_ids = [d["id"] for d in city_districts]
    
    # Get stores from districts
    if district_ids:
        district_stores = await db.stores.find(
            {"district_id": {"$in": district_ids}},
            {"_id": 0, "id": 1}
        ).to_list(1000)
        allowed_stores.update(s["id"] for s in district_stores)
    
    return allowed_stores


async def filter_stores_by_permission(stores: List[dict], user: dict) -> List[dict]:
    """Filter store list based on user permissions"""
    allowed = await get_user_allowed_stores(user)
    
    # None means all access
    if allowed is None:
        return stores
    
    # Filter stores
    return [s for s in stores if s.get("id") or s.get("store_id") in allowed or s.get("id") in allowed]


async def check_store_access(store_id: str, user: dict) -> bool:
    """Check if user has access to a specific store"""
    allowed = await get_user_allowed_stores(user)
    
    # None means all access
    if allowed is None:
        return True
    
    return store_id in allowed


async def get_user_store_filter(user: dict) -> dict:
    """Get MongoDB filter for stores based on user permissions"""
    allowed = await get_user_allowed_stores(user)
    
    # None means no filter (all access)
    if allowed is None:
        return {}
    
    # Empty set means no access
    if not allowed:
        return {"id": {"$in": []}}  # Will match nothing
    
    return {"id": {"$in": list(allowed)}}


async def get_user_permissions_summary(user: dict) -> dict:
    """Get summary of user permissions for frontend"""
    db_user = await db.users.find_one({"username": user["username"]}, {"_id": 0})
    if not db_user:
        return {"has_full_access": False, "allowed_stores": []}
    
    allowed_stores = await get_user_allowed_stores(user)
    
    return {
        "has_full_access": allowed_stores is None,
        "allowed_region_ids": db_user.get("allowed_region_ids", []),
        "allowed_city_ids": db_user.get("allowed_city_ids", []),
        "allowed_store_ids": db_user.get("allowed_store_ids", []),
        "computed_store_ids": list(allowed_stores) if allowed_stores is not None else []
    }
