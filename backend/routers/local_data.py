"""
Local Data Router - All data from MongoDB warehouse
VMS is only used for data collection, all reports come from local database
With Redis caching for improved performance (P2)
"""
from fastapi import APIRouter, Depends, Query
from typing import Optional, List
from datetime import datetime, timezone, timedelta

from database import db
from auth import require_auth
from permissions import get_user_allowed_stores
from cache import (
    get_cached_counter_data, set_cached_counter_data,
    get_cached_queue_data, set_cached_queue_data,
    get_cached_health_status, set_cached_health_status
)

router = APIRouter(tags=["Local Data"])


# ============== HELPER FUNCTIONS ==============

async def get_filtered_store_ids(user: dict, store_ids: Optional[str] = None) -> Optional[List[str]]:
    """Get store IDs filtered by user permissions"""
    allowed_stores = await get_user_allowed_stores(user)
    
    if store_ids:
        requested_ids = store_ids.split(",")
        if allowed_stores is not None:
            requested_ids = [sid for sid in requested_ids if sid in allowed_stores]
        return requested_ids
    elif allowed_stores is not None:
        return list(allowed_stores) if allowed_stores else []
    return None  # All stores


async def get_latest_store_snapshots(store_ids: Optional[List[str]] = None, snapshot_type: str = "counter"):
    """Get the most recent snapshot for each store"""
    collection = db.counter_snapshots if snapshot_type == "counter" else db.queue_snapshots
    
    # Get unique store IDs
    query = {}
    if store_ids:
        query["store_id"] = {"$in": store_ids}
    
    # Aggregate to get latest snapshot per store
    pipeline = [
        {"$match": query} if query else {"$match": {}},
        {"$sort": {"timestamp": -1}},
        {"$group": {
            "_id": "$store_id",
            "doc": {"$first": "$$ROOT"}
        }},
        {"$replaceRoot": {"newRoot": "$doc"}},
        {"$project": {"_id": 0}}
    ]
    
    results = await collection.aggregate(pipeline).to_list(500)
    return results


# ============== LIVE DATA ENDPOINTS (from local DB) ==============

@router.get("/live/counter")
async def get_live_counter_data(
    store_ids: Optional[str] = None,
    user: dict = Depends(require_auth)
):
    """Get latest counter data from local database (with Redis cache)"""
    filtered_ids = await get_filtered_store_ids(user, store_ids)
    
    if filtered_ids is not None and not filtered_ids:
        return []
    
    # Try cache first
    cache_key = ",".join(sorted(filtered_ids)) if filtered_ids else "all"
    cached = await get_cached_counter_data(cache_key)
    if cached is not None:
        return cached
    
    snapshots = await get_latest_store_snapshots(filtered_ids, "counter")
    
    # Enrich with location data
    result = []
    for snap in snapshots:
        store = await db.stores.find_one({"id": snap["store_id"]}, {"_id": 0})
        if not store:
            continue
            
        district = await db.districts.find_one({"id": store.get("district_id")}, {"_id": 0})
        city = None
        region = None
        if district:
            city = await db.cities.find_one({"id": district.get("city_id")}, {"_id": 0})
            if city:
                region = await db.regions.find_one({"id": city.get("region_id")}, {"_id": 0})
        
        # Calculate occupancy and status
        capacity = snap.get("capacity") or store.get("capacity", 100)
        current_visitors = snap.get("current_visitors", 0)
        occupancy_percent = round((current_visitors / capacity) * 100, 1) if capacity > 0 else 0
        
        # Calculate status based on occupancy
        if "status" in snap and snap.get("status") != "normal":
            status = snap.get("status")
        else:
            if occupancy_percent >= 90:
                status = "critical"
            elif occupancy_percent >= 70:
                status = "warning"
            else:
                status = "normal"
        
        result.append({
            "store_id": snap["store_id"],
            "store_name": snap["store_name"],
            "district_id": store.get("district_id", ""),
            "district_name": district["name"] if district else "",
            "city_id": city["id"] if city else "",
            "city_name": city["name"] if city else "",
            "region_id": region["id"] if region else "",
            "region_name": region["name"] if region else "",
            "total_in": snap.get("total_in", 0),
            "total_out": snap.get("total_out", 0),
            "current_visitors": current_visitors,
            "capacity": capacity,
            "occupancy_percent": occupancy_percent,
            "status": status,
            "camera_details": snap.get("camera_details", []),
            "timestamp": snap.get("timestamp", ""),
            "data_source": "local_warehouse"
        })
    
    # Cache the result
    await set_cached_counter_data(result, cache_key)
    
    return result


@router.get("/live/queue")
async def get_live_queue_data(
    store_ids: Optional[str] = None,
    user: dict = Depends(require_auth)
):
    """Get latest queue data from local database (with Redis cache)"""
    filtered_ids = await get_filtered_store_ids(user, store_ids)
    
    if filtered_ids is not None and not filtered_ids:
        return []
    
    # Try cache first
    cache_key = ",".join(sorted(filtered_ids)) if filtered_ids else "all"
    cached = await get_cached_queue_data(cache_key)
    if cached is not None:
        return cached
    
    snapshots = await get_latest_store_snapshots(filtered_ids, "queue")
    
    # Enrich with location data
    result = []
    for snap in snapshots:
        store = await db.stores.find_one({"id": snap["store_id"]}, {"_id": 0})
        if not store:
            continue
            
        district = await db.districts.find_one({"id": store.get("district_id")}, {"_id": 0})
        city = None
        region = None
        if district:
            city = await db.cities.find_one({"id": district.get("city_id")}, {"_id": 0})
            if city:
                region = await db.regions.find_one({"id": city.get("region_id")}, {"_id": 0})
        
        queue_threshold = store.get("queue_threshold", 5)
        total_queue = snap.get("total_queue_length", 0)
        
        # Calculate status if not in snapshot
        if "status" in snap:
            status = snap.get("status")
        else:
            if total_queue >= queue_threshold * 1.5:
                status = "critical"
            elif total_queue >= queue_threshold:
                status = "warning"
            else:
                status = "normal"
        
        result.append({
            "store_id": snap["store_id"],
            "store_name": snap["store_name"],
            "district_id": store.get("district_id", ""),
            "district_name": district["name"] if district else "",
            "city_id": city["id"] if city else "",
            "city_name": city["name"] if city else "",
            "region_id": region["id"] if region else "",
            "region_name": region["name"] if region else "",
            "total_queue_length": total_queue,
            "zones": snap.get("zones", []),
            "queue_threshold": queue_threshold,
            "status": status,
            "camera_details": snap.get("camera_details", []),
            "timestamp": snap.get("timestamp", ""),
            "data_source": "local_warehouse"
        })
    
    # Cache the result
    await set_cached_queue_data(result, cache_key)
    
    return result


# ============== REPORTS ENDPOINTS (from local DB) ==============

@router.get("/reports/summary")
async def get_reports_summary(
    region_id: Optional[str] = None,
    city_id: Optional[str] = None,
    district_id: Optional[str] = None,
    store_ids: Optional[str] = None,
    user: dict = Depends(require_auth)
):
    """Get summary report from local database"""
    filtered_ids = await get_filtered_store_ids(user, store_ids)
    
    # Apply location filters
    if region_id or city_id or district_id:
        district_ids = []
        if district_id:
            district_ids = [district_id]
        elif city_id:
            districts = await db.districts.find({"city_id": city_id}, {"_id": 0, "id": 1}).to_list(100)
            district_ids = [d["id"] for d in districts]
        elif region_id:
            cities = await db.cities.find({"region_id": region_id}, {"_id": 0, "id": 1}).to_list(100)
            city_ids = [c["id"] for c in cities]
            districts = await db.districts.find({"city_id": {"$in": city_ids}}, {"_id": 0, "id": 1}).to_list(500)
            district_ids = [d["id"] for d in districts]
        
        if district_ids:
            location_stores = await db.stores.find(
                {"district_id": {"$in": district_ids}},
                {"_id": 0, "id": 1}
            ).to_list(500)
            location_store_ids = [s["id"] for s in location_stores]
            
            if filtered_ids is not None:
                filtered_ids = [sid for sid in filtered_ids if sid in location_store_ids]
            else:
                filtered_ids = location_store_ids
    
    # Get latest snapshots
    counter_data = await get_latest_store_snapshots(filtered_ids, "counter")
    queue_data = await get_latest_store_snapshots(filtered_ids, "queue")
    
    # Build stores list with location info
    stores = []
    for snap in counter_data:
        store = await db.stores.find_one({"id": snap["store_id"]}, {"_id": 0})
        district = await db.districts.find_one({"id": store.get("district_id")}, {"_id": 0}) if store else None
        city = await db.cities.find_one({"id": district.get("city_id")}, {"_id": 0}) if district else None
        region = await db.regions.find_one({"id": city.get("region_id")}, {"_id": 0}) if city else None
        
        stores.append({
            "store_id": snap["store_id"],
            "store_name": snap["store_name"],
            "district_name": district["name"] if district else "",
            "city_name": city["name"] if city else "",
            "region_name": region["name"] if region else "",
            "total_in": snap.get("total_in", 0),
            "total_out": snap.get("total_out", 0),
            "current_visitors": snap.get("current_visitors", 0),
            "capacity": snap.get("capacity", 100),
            "occupancy_percent": snap.get("occupancy_percent", 0),
            "status": snap.get("status", "normal")
        })
    
    # Build queue list
    queues = []
    for snap in queue_data:
        queues.append({
            "store_id": snap["store_id"],
            "store_name": snap["store_name"],
            "total_queue_length": snap.get("total_queue_length", 0),
            "avg_wait_time_seconds": snap.get("avg_wait_time_seconds", 0)
        })
    
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "counter_summary": {
            "total_stores": len(stores),
            "total_visitors": sum(s["current_visitors"] for s in stores),
            "total_in": sum(s["total_in"] for s in stores),
            "total_out": sum(s["total_out"] for s in stores),
            "stores_critical": len([s for s in stores if s["status"] == "critical"]),
            "stores_warning": len([s for s in stores if s["status"] == "warning"]),
            "stores_normal": len([s for s in stores if s["status"] == "normal"])
        },
        "queue_summary": {
            "total_stores": len(queues),
            "total_queue_length": sum(q["total_queue_length"] for q in queues)
        },
        "analytics_summary": {"total_events": 0},
        "stores": stores,
        "queues": queues,
        "data_source": "local_warehouse"
    }


@router.get("/reports/counter")
async def get_counter_report(
    region_id: Optional[str] = None,
    city_id: Optional[str] = None,
    district_id: Optional[str] = None,
    store_ids: Optional[str] = None,
    date_range: str = "1d",
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    hour_from: Optional[int] = None,
    hour_to: Optional[int] = None,
    user: dict = Depends(require_auth)
):
    """Get counter report from local database"""
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"Counter report: date_range={date_range}, date_from={date_from}, date_to={date_to}, hour_from={hour_from}, hour_to={hour_to}")
    
    filtered_ids = await get_filtered_store_ids(user, store_ids)
    
    # Calculate date range
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")
    
    if date_from and date_to:
        start_date = date_from
        end_date = date_to
    elif date_range == "1d":
        start_date = end_date = today
    elif date_range in ("1w", "7d"):
        start_date = (now - timedelta(days=7)).strftime("%Y-%m-%d")
        end_date = today
    elif date_range in ("1m", "30d"):
        start_date = (now - timedelta(days=30)).strftime("%Y-%m-%d")
        end_date = today
    else:
        start_date = end_date = today
    
    # Build query
    query = {"date": {"$gte": start_date, "$lte": end_date}}
    if filtered_ids:
        query["store_id"] = {"$in": filtered_ids}
    
    # Add hour filter if specified
    if hour_from is not None:
        query["hour"] = {"$gte": hour_from}
    if hour_to is not None:
        if "hour" in query:
            query["hour"]["$lte"] = hour_to
        else:
            query["hour"] = {"$lte": hour_to}
    
    logger.info(f"Counter report query: {query}")
    
    # Get active store IDs to filter out deleted stores
    active_stores = await db.stores.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(500)
    active_store_ids = {s["id"] for s in active_stores}
    active_store_names = {s["id"]: s["name"] for s in active_stores}
    
    stores = []
    
    # For today without hour filter, use latest snapshots (real-time data)
    if start_date == end_date == today and hour_from is None and hour_to is None and date_from is None and date_to is None:
        snapshots = await get_latest_store_snapshots(filtered_ids, "counter")
        for snap in snapshots:
            # Skip deleted stores
            if snap["store_id"] not in active_store_ids:
                continue
            stores.append({
                "store_id": snap["store_id"],
                "store_name": active_store_names.get(snap["store_id"], snap["store_name"]),
                "total_in": snap.get("total_in", 0),
                "total_out": snap.get("total_out", 0),
                "current_visitors": snap.get("current_visitors", 0),
                "max_visitors": snap.get("current_visitors", 0),
                "date": today,
                "status": snap.get("status", "normal")
            })
    elif hour_from is not None or hour_to is not None:
        # Hour filter: aggregate snapshots within hour range
        pipeline = [
            {"$match": query},
            {"$sort": {"date": 1, "hour": 1, "minute": 1}},
            {"$group": {
                "_id": "$store_id",
                "max_in": {"$max": "$total_in"},
                "max_out": {"$max": "$total_out"},
                "last_visitors": {"$last": "$current_visitors"},
                "store_name": {"$first": "$store_name"},
                "snapshot_count": {"$sum": 1}
            }}
        ]
        results = await db.counter_snapshots.aggregate(pipeline).to_list(500)
        
        logger.info(f"Hour-filtered report: Found {len(results)} stores with {sum(r.get('snapshot_count', 0) for r in results)} total snapshots")
        
        for r in results:
            # Skip deleted stores
            if r["_id"] not in active_store_ids:
                continue
            stores.append({
                "store_id": r["_id"],
                "store_name": active_store_names.get(r["_id"], r.get("store_name", "Bilinmiyor")),
                "total_in": r.get("max_in", 0),
                "total_out": r.get("max_out", 0),
                "current_visitors": r.get("last_visitors", 0),
                "max_visitors": r.get("last_visitors", 0),
                "date": f"{start_date} to {end_date}",
                "status": "normal"
            })
    else:
        # Use daily_reports collection (from VMS report API)
        dr_query = {"date": {"$gte": start_date, "$lte": end_date}}
        if filtered_ids:
            dr_query["store_id"] = {"$in": filtered_ids}
        daily_docs = await db.daily_reports.find(dr_query, {"_id": 0}).to_list(10000)
        store_data = {}
        for doc in daily_docs:
            sid = doc.get("store_id")
            if not sid or sid not in active_store_ids:
                continue
            if sid not in store_data:
                store_data[sid] = {
                    "store_id": sid,
                    "store_name": active_store_names.get(sid, doc.get("store_name", "Bilinmiyor")),
                    "total_in": 0,
                    "total_out": 0,
                    "max_visitors": 0,
                    "days": 0
                }
            counter = doc.get("counter", {})
            store_data[sid]["total_in"] += counter.get("total_in", 0)
            store_data[sid]["total_out"] += counter.get("total_out", 0)
            store_data[sid]["days"] += 1
        stores = list(store_data.values())
        for s in stores:
            s["current_visitors"] = max(0, s["total_in"] - s["total_out"])
            s["avg_daily_visitors"] = round(s["total_in"] / s["days"], 1) if s["days"] > 0 else 0
            s["status"] = "normal"
            s["avg_daily_visitors"] = round(s["total_in"] / s["days"], 1) if s["days"] > 0 else 0
            s["status"] = "normal"
    
    return {
        "report_type": "counter",
        "date_range": date_range,
        "date_from": start_date,
        "date_to": end_date,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "summary": {
            "total_stores": len(stores),
            "total_in": sum(s["total_in"] for s in stores),
            "total_out": sum(s["total_out"] for s in stores),
            "current_visitors": sum(s.get("current_visitors", 0) for s in stores)
        },
        "stores": stores,
        "data_source": "local_warehouse"
    }


@router.get("/reports/queue")
async def get_queue_report(
    region_id: Optional[str] = None,
    city_id: Optional[str] = None,
    district_id: Optional[str] = None,
    store_ids: Optional[str] = None,
    date_range: str = "1d",
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    hour_from: Optional[int] = None,
    hour_to: Optional[int] = None,
    user: dict = Depends(require_auth)
):
    """Get queue report from local database"""
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"Queue report: date_range={date_range}, date_from={date_from}, date_to={date_to}, hour_from={hour_from}, hour_to={hour_to}")
    
    filtered_ids = await get_filtered_store_ids(user, store_ids)
    
    # Calculate date range
    now = datetime.now(timezone.utc)
    if date_from and date_to:
        start_date = date_from
        end_date = date_to
    elif date_range == "1d":
        start_date = end_date = now.strftime("%Y-%m-%d")
    elif date_range in ("1w", "7d"):
        start_date = (now - timedelta(days=7)).strftime("%Y-%m-%d")
        end_date = now.strftime("%Y-%m-%d")
    elif date_range in ("1m", "30d"):
        start_date = (now - timedelta(days=30)).strftime("%Y-%m-%d")
        end_date = now.strftime("%Y-%m-%d")
    else:
        start_date = end_date = now.strftime("%Y-%m-%d")
    
    # Build query
    query = {"date": {"$gte": start_date, "$lte": end_date}}
    if filtered_ids:
        query["store_id"] = {"$in": filtered_ids}
    
    # Add hour filter if specified
    if hour_from is not None:
        query["hour"] = {"$gte": hour_from}
    if hour_to is not None:
        if "hour" in query:
            query["hour"]["$lte"] = hour_to
        else:
            query["hour"] = {"$lte": hour_to}
    
    logger.info(f"Queue report query: {query}")
    
    # Get snapshots
    snapshots = await db.queue_snapshots.find(query, {"_id": 0}).to_list(10000)
    
    logger.info(f"Queue report: Found {len(snapshots)} snapshots")
    
    # Aggregate by store
    store_data = {}
    for snap in snapshots:
        sid = snap["store_id"]
        if sid not in store_data:
            store_data[sid] = {
                "store_id": sid,
                "store_name": snap["store_name"],
                "max_queue_length": 0,
                "total_queue_readings": 0,
                "sum_queue_length": 0
            }
        store_data[sid]["max_queue_length"] = max(store_data[sid]["max_queue_length"], snap.get("total_queue_length", 0))
        store_data[sid]["sum_queue_length"] += snap.get("total_queue_length", 0)
        store_data[sid]["total_queue_readings"] += 1
    
    stores = list(store_data.values())
    for s in stores:
        s["avg_queue_length"] = round(s["sum_queue_length"] / s["total_queue_readings"], 1) if s["total_queue_readings"] > 0 else 0
        del s["sum_queue_length"]
        del s["total_queue_readings"]
    
    return {
        "report_type": "queue",
        "date_range": date_range,
        "date_from": start_date,
        "date_to": end_date,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "summary": {
            "total_stores": len(stores),
            "max_queue": max([s["max_queue_length"] for s in stores]) if stores else 0,
            "avg_queue": round(sum([s["avg_queue_length"] for s in stores]) / len(stores), 1) if stores else 0
        },
        "stores": stores,
        "data_source": "local_warehouse"
    }


# ============== ADVANCED REPORTS (from local DB) ==============

@router.get("/reports/advanced/hourly-traffic")
async def get_hourly_traffic_report(
    store_ids: Optional[str] = None,
    date_range: str = "1d",
    user: dict = Depends(require_auth)
):
    """Get hourly traffic pattern from local database"""
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"Hourly traffic report: date_range={date_range}")
    
    filtered_ids = await get_filtered_store_ids(user, store_ids)
    
    # Calculate date range
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")
    
    if date_from and date_to:
        start_date=date_from;end_date=date_to
    elif date_range == "1d":
        start_date = end_date = today
    elif date_range in ("1w", "7d"):
        start_date = (now - timedelta(days=7)).strftime("%Y-%m-%d")
        end_date = today
    elif date_range in ("1m", "30d"):
        start_date = (now - timedelta(days=30)).strftime("%Y-%m-%d")
        end_date = today
    else:
        start_date = end_date = today
    
    # Build query
    query = {"date": {"$gte": start_date, "$lte": end_date}}
    if filtered_ids:
        query["store_id"] = {"$in": filtered_ids}
    
    logger.info(f"Hourly traffic query: {query}")
    
    # Get snapshots for the date range
    snapshots = await db.counter_snapshots.find(query, {"_id": 0}).to_list(50000)
    
    logger.info(f"Found {len(snapshots)} snapshots for hourly traffic")
    
    # Aggregate by hour across all days
    hour_totals = {h: {"in": 0, "out": 0, "visitors": 0, "count": 0} for h in range(24)}
    
    for snap in snapshots:
        hour = snap.get("hour", 0)
        if 0 <= hour < 24:
            hour_totals[hour]["in"] += snap.get("total_in", 0)
            hour_totals[hour]["out"] += snap.get("total_out", 0)
            hour_totals[hour]["visitors"] += snap.get("current_visitors", 0)
            hour_totals[hour]["count"] += 1
    
    # Build result with averages
    peak_hours = [11, 12, 13, 17, 18, 19]  # Typical peak hours
    hourly_result = []
    for hour in range(8, 23):  # Business hours
        count = hour_totals[hour]["count"]
        hourly_result.append({
            "hour": f"{hour:02d}:00",
            "visitors": round(hour_totals[hour]["visitors"] / count) if count > 0 else 0,
            "in_count": round(hour_totals[hour]["in"] / count) if count > 0 else 0,
            "out_count": round(hour_totals[hour]["out"] / count) if count > 0 else 0,
            "is_peak": hour in peak_hours
        })
    
    total_traffic = sum(h["visitors"] for h in hourly_result)
    
    return {
        "report_type": "hourly_traffic",
        "date_range": date_range,
        "date_from": start_date,
        "date_to": end_date,
        "total_traffic": total_traffic,
        "peak_hours": [f"{h:02d}:00" for h in peak_hours],
        "hourly_data": hourly_result,
        "data_source": "local_warehouse"
    }


@router.get("/reports/advanced/store-comparison")
async def get_store_comparison(
    store_ids: Optional[str] = None,
    date_range: str = "1d",
    user: dict = Depends(require_auth)
):
    """Compare performance between stores from local database"""
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"Store comparison report: date_range={date_range}")
    
    filtered_ids = await get_filtered_store_ids(user, store_ids)
    
    # Calculate date range
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")
    
    if date_from and date_to:
        start_date=date_from;end_date=date_to
    elif date_range == "1d":
        start_date = end_date = today
    elif date_range in ("1w", "7d"):
        start_date = (now - timedelta(days=7)).strftime("%Y-%m-%d")
        end_date = today
    elif date_range in ("1m", "30d"):
        start_date = (now - timedelta(days=30)).strftime("%Y-%m-%d")
        end_date = today
    else:
        start_date = end_date = today
    
    # Build query
    query = {"date": {"$gte": start_date, "$lte": end_date}}
    if filtered_ids:
        query["store_id"] = {"$in": filtered_ids}
    
    # Get last snapshot of each day per store for the date range
    pipeline = [
        {"$match": query},
        {"$sort": {"hour": -1, "minute": -1}},
        {"$group": {
            "_id": {"store_id": "$store_id", "date": "$date"},
            "total_in": {"$max": "$total_in"}, "total_out": {"$max": "$total_out"}, "store_name": {"$first": "$store_name"}
        }},
        
        {"$project": {"_id": 0}}
    ]
    snapshots = await db.counter_snapshots.aggregate(pipeline).to_list(10000)
    
    logger.info(f"Store comparison: Found {len(snapshots)} daily snapshots")
    
    if not snapshots:
        return {
            "report_type": "store_comparison",
            "date_range": date_range,
            "date_from": start_date,
            "date_to": end_date,
            "total_stores": 0,
            "stores": [],
            "data_source": "local_warehouse"
        }
    
    # Aggregate by store
    store_data = {}
    for snap in snapshots:
        sid = snap["store_id"]
        if sid not in store_data:
            store_data[sid] = {
                "store_id": sid,
                "store_name": snap.get("store_name", "Bilinmiyor"),
                "total_in": 0,
                "total_out": 0,
                "max_visitors": 0,
                "days": 0
            }
        store_data[sid]["total_in"] += snap.get("total_in", 0)
        store_data[sid]["total_out"] += snap.get("total_out", 0)
        store_data[sid]["max_visitors"] = max(store_data[sid]["max_visitors"], snap.get("current_visitors", 0))
        store_data[sid]["days"] += 1
    
    counter_data = list(store_data.values())
    for s in counter_data:
        s["current_visitors"] = max(0, s["total_in"] - s["total_out"])
        s["occupancy_percent"] = 0  # Would need capacity info
    
    # Calculate averages
    avg_visitors = sum(s.get("current_visitors", 0) for s in counter_data) / len(counter_data) if counter_data else 0
    avg_in = sum(s.get("total_in", 0) for s in counter_data) / len(counter_data) if counter_data else 0
    
    # Build comparison
    store_comparison = []
    for s in counter_data:
        visitors = s.get("total_in", 0)
        variance = round(((visitors - avg_in) / avg_in * 100) if avg_in > 0 else 0, 1)
        
        store_comparison.append({
            "store_id": s["store_id"],
            "store_name": s["store_name"],
            "total_in": s.get("total_in", 0),
            "total_out": s.get("total_out", 0),
            "current_visitors": s.get("current_visitors", 0),
            "occupancy_percent": s.get("occupancy_percent", 0),
            "variance_from_avg": variance,
            "status": "normal"
        })
    
    # Sort by total_in descending
    store_comparison.sort(key=lambda x: x["total_in"], reverse=True)
    
    return {
        "report_type": "store_comparison",
        "date_range": date_range,
        "date_from": start_date,
        "date_to": end_date,
        "total_stores": len(counter_data),
        "average_visitors": round(avg_visitors, 1),
        "average_entries": round(avg_in, 1),
        "top_performer": store_comparison[0] if store_comparison else None,
        "bottom_performer": store_comparison[-1] if store_comparison else None,
        "stores": store_comparison,
        "data_source": "local_warehouse"
    }


@router.get("/reports/advanced/queue-analysis")
async def get_advanced_queue_analysis(
    store_ids: Optional[str] = None,
    date_range: str = "1d",
    user: dict = Depends(require_auth)
):
    """Advanced queue analysis from local database"""
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"Queue analysis report: date_range={date_range}")
    
    filtered_ids = await get_filtered_store_ids(user, store_ids)
    
    # Calculate date range
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")
    
    if date_from and date_to:
        start_date=date_from;end_date=date_to
    elif date_range == "1d":
        start_date = end_date = today
    elif date_range in ("1w", "7d"):
        start_date = (now - timedelta(days=7)).strftime("%Y-%m-%d")
        end_date = today
    elif date_range in ("1m", "30d"):
        start_date = (now - timedelta(days=30)).strftime("%Y-%m-%d")
        end_date = today
    else:
        start_date = end_date = today
    
    # Build query
    query = {"date": {"$gte": start_date, "$lte": end_date}}
    if filtered_ids:
        query["store_id"] = {"$in": filtered_ids}
    
    # Get queue snapshots for the date range
    snapshots = await db.queue_snapshots.find(query, {"_id": 0}).to_list(10000)
    
    logger.info(f"Queue analysis: Found {len(snapshots)} snapshots")
    
    if not snapshots:
        return {
            "report_type": "queue_analysis",
            "date_range": date_range,
            "date_from": start_date,
            "date_to": end_date,
            "total_stores": 0,
            "stores": [],
            "data_source": "local_warehouse"
        }
    
    # Aggregate by store
    store_data = {}
    for snap in snapshots:
        sid = snap["store_id"]
        if sid not in store_data:
            store_data[sid] = {
                "store_id": sid,
                "store_name": snap.get("store_name", "Bilinmiyor"),
                "max_queue": 0,
                "sum_queue": 0,
                "count": 0
            }
        store_data[sid]["max_queue"] = max(store_data[sid]["max_queue"], snap.get("total_queue_length", 0))
        store_data[sid]["sum_queue"] += snap.get("total_queue_length", 0)
        store_data[sid]["count"] += 1
    
    queue_data = list(store_data.values())
    
    # Calculate totals
    total_queue = sum(s["sum_queue"] for s in queue_data)
    total_count = sum(s["count"] for s in queue_data)
    
    # Build analysis
    store_analysis = []
    for s in queue_data:
        avg_queue = round(s["sum_queue"] / s["count"], 1) if s["count"] > 0 else 0
        est_wait = round(avg_queue * 2, 1)  # Estimate 2 min per person
        
        store_analysis.append({
            "store_id": s["store_id"],
            "store_name": s["store_name"],
            "current_queue": avg_queue,
            "max_queue": s["max_queue"],
            "estimated_wait_min": est_wait,
            "status": "critical" if avg_queue > 5 else ("warning" if avg_queue > 3 else "normal"),
            "zones": []
        })
    
    # Sort by queue length descending
    store_analysis.sort(key=lambda x: x["current_queue"], reverse=True)
    
    return {
        "report_type": "queue_analysis",
        "date_range": date_range,
        "date_from": start_date,
        "date_to": end_date,
        "total_stores": len(queue_data),
        "total_queue_length": round(total_queue / total_count, 1) if total_count > 0 else 0,
        "average_queue": round(total_queue / total_count, 1) if total_count > 0 else 0,
        "stores": store_analysis,
        "data_source": "local_warehouse"
    }


@router.get("/reports/advanced/weekday-comparison")
async def get_weekday_comparison(
    store_ids: Optional[str] = None,
    date_range: str = "1w",
    user: dict = Depends(require_auth)
):
    """Compare weekday vs weekend traffic from local database"""
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"Weekday comparison report: date_range={date_range}")
    
    filtered_ids = await get_filtered_store_ids(user, store_ids)
    
    # Calculate number of days based on date_range
    now = datetime.now(timezone.utc)
    
    if date_range == "1d":
        num_days = 1
    elif date_range in ("1w", "7d"):
        num_days = 7
    elif date_range in ("1m", "30d"):
        num_days = 30
    else:
        num_days = 7
    
    daily_data = []
    
    for i in range(num_days):
        date = now - timedelta(days=i)
        date_str = date.strftime("%Y-%m-%d")
        day_name = date.strftime("%A")
        
        query = {"date": date_str}
        if filtered_ids:
            query["store_id"] = {"$in": filtered_ids}
        
        # Get last snapshot of each store for this day and sum their total_in
        pipeline = [
            {"$match": query},
            {"$sort": {"hour": -1, "minute": -1}},
            {"$group": {
                "_id": "$store_id",
                "total_in": {"$first": "$total_in"}
            }}
        ]
        results = await db.counter_snapshots.aggregate(pipeline).to_list(100)
        
        total_in = sum(r.get("total_in", 0) for r in results)
        
        is_weekend = day_name in ["Saturday", "Sunday", "Cumartesi", "Pazar"]
        daily_data.append({
            "date": date_str,
            "day": day_name,
            "visitors": total_in,
            "type": "weekend" if is_weekend else "weekday"
        })
    
    # Calculate totals
    weekday_total = sum(d["visitors"] for d in daily_data if d["type"] == "weekday")
    weekend_total = sum(d["visitors"] for d in daily_data if d["type"] == "weekend")
    weekday_count = len([d for d in daily_data if d["type"] == "weekday"])
    weekend_count = len([d for d in daily_data if d["type"] == "weekend"])
    
    logger.info(f"Weekday comparison: {num_days} days, weekday_total={weekday_total}, weekend_total={weekend_total}")
    
    return {
        "report_type": "weekday_comparison",
        "date_range": date_range,
        "num_days": num_days,
        "daily_data": daily_data,
        "weekday_total": weekday_total,
        "weekend_total": weekend_total,
        "weekday_avg": weekday_total // weekday_count if weekday_count > 0 else 0,
        "weekend_avg": weekend_total // weekend_count if weekend_count > 0 else 0,
        "data_source": "local_warehouse"
    }



@router.get("/reports/advanced/demographics")
async def get_demographics_report(
    store_ids: Optional[str] = None,
    date_range: str = "1d",
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    user: dict = Depends(require_auth)
):
    """Get demographics report from local database (analytics_snapshots)"""
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"Demographics report: date_range={date_range}")
    
    filtered_ids = await get_filtered_store_ids(user, store_ids)
    
    # Calculate date range
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")
    
    if date_from and date_to:
        start_date=date_from;end_date=date_to
    elif date_range == "1d":
        start_date = end_date = today
    elif date_range in ("1w", "7d"):
        start_date = (now - timedelta(days=7)).strftime("%Y-%m-%d")
        end_date = today
    elif date_range in ("1m", "30d"):
        start_date = (now - timedelta(days=30)).strftime("%Y-%m-%d")
        end_date = today
    else:
        start_date = end_date = today
    
    # Build query
    query = {"date": {"$gte": start_date, "$lte": end_date}}
    if filtered_ids:
        query["store_id"] = {"$in": filtered_ids}
    
    # Get data: today from analytics_snapshots, historical from daily_reports
    gender_dist = {"Male": 0, "Female": 0, "Unknown": 0}
    age_dist = {"0-17": 0, "18-24": 0, "25-34": 0, "35-44": 0, "45-54": 0, "55+": 0}
    total = 0
    if start_date == end_date == today:
        snapshots = await db.analytics_snapshots.find(query, {"_id": 0}).to_list(10000)
        logger.info(f"Demographics today: Found {len(snapshots)} snapshots")
        for snap in snapshots:
            snap_gender = snap.get("gender_distribution", {})
            snap_age = snap.get("age_distribution", {})
            for k, v in snap_gender.items():
                if k in gender_dist:
                    gender_dist[k] += v
                else:
                    gender_dist["Unknown"] += v
            for k, v in snap_age.items():
                if k in age_dist:
                    age_dist[k] += v
            total += snap.get("total_events", 0)
    else:
        dr_query = {"date": {"$gte": start_date, "$lte": end_date}}
        if filtered_ids:
            dr_query["store_id"] = {"$in": filtered_ids}
        daily_docs = await db.daily_reports.find(dr_query, {"_id": 0}).to_list(1000)
        logger.info(f"Demographics historical: Found {len(daily_docs)} daily reports")
        seen_dates = set()
        for doc in daily_docs:
            date_key = doc.get("date")
            if date_key in seen_dates:
                continue
            seen_dates.add(date_key)
            fr = doc.get("fr_analytics", {})
            gender_dist["Male"] += fr.get("male", 0)
            gender_dist["Female"] += fr.get("female", 0)
            gender_dist["Unknown"] += fr.get("unknown_gender", 0)
            age_dist["0-17"] += fr.get("age_0_17", 0)
            age_dist["18-24"] += fr.get("age_18_24", 0)
            age_dist["25-34"] += fr.get("age_25_34", 0)
            age_dist["35-44"] += fr.get("age_35_44", 0)
            age_dist["45-54"] += fr.get("age_45_54", 0)
            age_dist["55+"] += fr.get("age_55_64", 0) + fr.get("age_65_plus", 0)
            total += fr.get("in", 0)
    
    # Calculate percentages
    gender_percent = {k: round(v / total * 100, 1) if total > 0 else 0 for k, v in gender_dist.items()}
    age_percent = {k: round(v / total * 100, 1) if total > 0 else 0 for k, v in age_dist.items()}
    
    # Primary demographics - filter out Unknown and zero values
    valid_genders = {k: v for k, v in gender_dist.items() if k in ["Male", "Female"] and v > 0}
    primary_gender = max(valid_genders.items(), key=lambda x: x[1])[0] if valid_genders else "Unknown"
    
    valid_ages = {k: v for k, v in age_dist.items() if v > 0}
    primary_age = max(valid_ages.items(), key=lambda x: x[1])[0] if valid_ages else "Unknown"
    
    # Age group analysis
    young = (age_dist.get("0-17", 0) + age_dist.get("18-24", 0))
    adult = (age_dist.get("25-34", 0) + age_dist.get("35-44", 0))
    mature = (age_dist.get("45-54", 0) + age_dist.get("55+", 0))
    
    return {
        "report_type": "demographics",
        "date_range": date_range,
        "date_from": start_date,
        "date_to": end_date,
        "total_detections": total,
        "gender_distribution": gender_dist,
        "gender_percent": gender_percent,
        "age_distribution": age_dist,
        "age_percent": age_percent,
        "primary_gender": primary_gender,
        "primary_age_group": primary_age,
        "age_categories": {
            "young_18_24": young,
            "adult_25_44": adult,
            "mature_45_plus": mature
        },
        "insights": {
            "gender_balance": "balanced" if abs(gender_dist.get("Male", 0) - gender_dist.get("Female", 0)) < total * 0.1 else (
                "male_dominant" if gender_dist.get("Male", 0) > gender_dist.get("Female", 0) else "female_dominant"
            ),
            "age_focus": "young" if young > adult + mature else ("mature" if mature > young + adult else "adult")
        },
        "data_source": "local_warehouse"
    }
