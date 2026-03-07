"""Live Data routes"""
from fastapi import APIRouter, Query, Depends
from typing import Optional

from database import db
from vms_utils import fetch_vms_data, parse_counter_xml, parse_queue_xml, parse_analytics_xml
from auth import require_auth
from permissions import get_user_allowed_stores

router = APIRouter(prefix="/live", tags=["Live Data"])


@router.get("/counter")
async def get_live_counter_data(
    store_ids: Optional[str] = None,
    user: dict = Depends(require_auth)
):
    """Get live people counter data for all or specific stores"""
    result = []
    
    # Get user's allowed stores
    allowed_stores = await get_user_allowed_stores(user)
    
    store_query = {}
    if store_ids:
        requested_ids = store_ids.split(",")
        # Filter by user permissions
        if allowed_stores is not None:
            requested_ids = [sid for sid in requested_ids if sid in allowed_stores]
        store_query["id"] = {"$in": requested_ids}
    elif allowed_stores is not None:
        # User has restricted access
        if not allowed_stores:
            return []  # No access
        store_query["id"] = {"$in": list(allowed_stores)}
    
    stores = await db.stores.find(store_query, {"_id": 0}).to_list(100)
    
    vms_servers = await db.vms_servers.find({"is_active": True}, {"_id": 0}).to_list(100)
    vms_dict = {v["id"]: v for v in vms_servers}
    
    cameras = await db.cameras.find({"type": "counter"}, {"_id": 0}).to_list(500)
    camera_by_store = {}
    for c in cameras:
        if c["store_id"] not in camera_by_store:
            camera_by_store[c["store_id"]] = []
        camera_by_store[c["store_id"]].append(c)
    
    vms_data = {}
    for vms_id, vms in vms_dict.items():
        xml_data = await fetch_vms_data(vms, "/rsapi/modules/counter/getstats")
        if xml_data:
            parsed = parse_counter_xml(xml_data)
            for p in parsed.get('cameras', parsed) if isinstance(parsed, dict) else parsed:
                if isinstance(p, dict):
                    vms_data[p["camera_id"]] = p
    
    for store in stores:
        store_cameras = camera_by_store.get(store["id"], [])
        total_in = 0
        total_out = 0
        
        for cam in store_cameras:
            cam_data = vms_data.get(cam["camera_vms_id"])
            if cam_data:
                total_in += cam_data.get("in_count", 0)
                total_out += cam_data.get("out_count", 0)
        
        current_visitors = max(0, total_in - total_out)
        occupancy_percent = (current_visitors / store["capacity"] * 100) if store["capacity"] > 0 else 0
        
        district = await db.districts.find_one({"id": store.get("district_id")}, {"_id": 0})
        city = None
        region = None
        if district:
            city = await db.cities.find_one({"id": district.get("city_id")}, {"_id": 0})
            if city:
                region = await db.regions.find_one({"id": city.get("region_id")}, {"_id": 0})
        
        result.append({
            "store_id": store["id"],
            "store_name": store["name"],
            "district_id": store.get("district_id"),
            "district_name": district["name"] if district else "",
            "city_id": city["id"] if city else "",
            "city_name": city["name"] if city else "",
            "region_id": region["id"] if region else "",
            "region_name": region["name"] if region else "",
            "total_in": total_in,
            "total_out": total_out,
            "current_visitors": current_visitors,
            "capacity": store["capacity"],
            "occupancy_percent": round(occupancy_percent, 1),
            "status": "critical" if occupancy_percent >= 95 else "warning" if occupancy_percent >= 80 else "normal"
        })
    
    return result


@router.get("/queue")
async def get_live_queue_data(
    store_ids: Optional[str] = None,
    user: dict = Depends(require_auth)
):
    """Get live queue data for all or specific stores"""
    result = []
    
    # Get user's allowed stores
    allowed_stores = await get_user_allowed_stores(user)
    
    store_query = {}
    if store_ids:
        requested_ids = store_ids.split(",")
        if allowed_stores is not None:
            requested_ids = [sid for sid in requested_ids if sid in allowed_stores]
        store_query["id"] = {"$in": requested_ids}
    elif allowed_stores is not None:
        if not allowed_stores:
            return []
        store_query["id"] = {"$in": list(allowed_stores)}
    
    stores = await db.stores.find(store_query, {"_id": 0}).to_list(100)
    
    vms_servers = await db.vms_servers.find({"is_active": True}, {"_id": 0}).to_list(100)
    vms_dict = {v["id"]: v for v in vms_servers}
    
    cameras = await db.cameras.find({"type": "queue"}, {"_id": 0}).to_list(500)
    camera_by_store = {}
    for c in cameras:
        if c["store_id"] not in camera_by_store:
            camera_by_store[c["store_id"]] = []
        camera_by_store[c["store_id"]].append(c)
    
    vms_data = {}
    for vms_id, vms in vms_dict.items():
        xml_data = await fetch_vms_data(vms, "/rsapi/modules/queue/getstats")
        if xml_data:
            parsed = parse_queue_xml(xml_data)
            for p in parsed.get('cameras', []):
                vms_data[p["camera_id"]] = p
    
    for store in stores:
        store_cameras = camera_by_store.get(store["id"], [])
        zones = []
        total_queue = 0
        
        for cam in store_cameras:
            cam_data = vms_data.get(cam["camera_vms_id"])
            if cam_data:
                for zone in cam_data.get("zones", []):
                    total_queue += zone["queue_length"]
                    zones.append({
                        "camera_name": cam["name"],
                        "zone_index": zone["zone_index"],
                        "queue_length": zone["queue_length"],
                        "is_queue": zone["is_queue"]
                    })
        
        district = await db.districts.find_one({"id": store.get("district_id")}, {"_id": 0})
        city = None
        region = None
        if district:
            city = await db.cities.find_one({"id": district.get("city_id")}, {"_id": 0})
            if city:
                region = await db.regions.find_one({"id": city.get("region_id")}, {"_id": 0})
        
        result.append({
            "store_id": store["id"],
            "store_name": store["name"],
            "district_name": district["name"] if district else "",
            "city_name": city["name"] if city else "",
            "region_name": region["name"] if region else "",
            "total_queue_length": total_queue,
            "queue_threshold": store.get("queue_threshold", 5),
            "zones": zones,
            "status": "critical" if total_queue >= store.get("queue_threshold", 5) * 2 else "warning" if total_queue >= store.get("queue_threshold", 5) else "normal"
        })
    
    return result


@router.get("/analytics")
async def get_live_analytics_data(
    store_ids: Optional[str] = None,
    time_from: Optional[str] = None,
    time_to: Optional[str] = None,
    gender: Optional[str] = None,
    from_age: Optional[int] = None,
    to_age: Optional[int] = None,
    user: dict = Depends(require_auth)
):
    """Get analytics data (age/gender) for stores"""
    # Get user's allowed stores for filtering
    allowed_stores = await get_user_allowed_stores(user)
    
    result = {
        "total_events": 0,
        "gender_distribution": {"Male": 0, "Female": 0, "Unknown": 0},
        "age_distribution": {
            "0-17": 0, "18-24": 0, "25-34": 0, "35-44": 0, "45-54": 0, "55+": 0
        },
        "events": []
    }
    
    # If user has no access to any store, return empty
    if allowed_stores is not None and not allowed_stores:
        return result
    
    vms_servers = await db.vms_servers.find({"is_active": True}, {"_id": 0}).to_list(100)
    
    for vms in vms_servers:
        params = []
        if time_from:
            params.append(f"timeFrom={time_from}")
        if time_to:
            params.append(f"timeTo={time_to}")
        if gender:
            params.append(f"gender={gender}")
        if from_age:
            params.append(f"fromAge={from_age}")
        if to_age:
            params.append(f"toAge={to_age}")
        
        query_string = "&".join(params) if params else ""
        endpoint = f"/rsapi/modules/fr/searchevents?{query_string}" if query_string else "/rsapi/modules/fr/searchevents?lastMinutes=60"
        
        xml_data = await fetch_vms_data(vms, endpoint)
        if xml_data:
            events = parse_analytics_xml(xml_data)
            for event in events.get('cameras', []):
                result["total_events"] += 1
                
                gender_val = event.get("gender", "Unknown")
                if gender_val in result["gender_distribution"]:
                    result["gender_distribution"][gender_val] += 1
                else:
                    result["gender_distribution"]["Unknown"] += 1
                
                age = event.get("age", 0)
                if isinstance(age, str):
                    try:
                        age = int(age)
                    except (ValueError, TypeError):
                        age = 0
                
                if age < 18:
                    result["age_distribution"]["0-17"] += 1
                elif age < 25:
                    result["age_distribution"]["18-24"] += 1
                elif age < 35:
                    result["age_distribution"]["25-34"] += 1
                elif age < 45:
                    result["age_distribution"]["35-44"] += 1
                elif age < 55:
                    result["age_distribution"]["45-54"] += 1
                else:
                    result["age_distribution"]["55+"] += 1
                
                result["events"].append(event)
    
    return result
