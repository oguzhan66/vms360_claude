"""Advanced Analytics Router - Using Local Data Warehouse"""
from fastapi import APIRouter, Query, Depends
from typing import Optional, List
from datetime import datetime, timezone, timedelta
from collections import defaultdict

from database import db
from auth import require_auth

router = APIRouter(prefix="/analytics", tags=["Advanced Analytics"])


# ============== HELPER FUNCTIONS ==============

async def get_daily_summaries_for_range(start_date: str, end_date: str, store_ids: List[str] = None) -> List[dict]:
    """Get daily summaries for a date range, optionally filtered by stores"""
    query = {"date": {"$gte": start_date, "$lte": end_date}}
    if store_ids:
        query["store_id"] = {"$in": store_ids}
    return await db.daily_summaries.find(query, {"_id": 0}).sort("date", 1).to_list(10000)


async def get_hourly_data_for_date(date_str: str, store_ids: List[str] = None) -> List[dict]:
    """Get hourly aggregates for a specific date"""
    query = {"date": date_str}
    if store_ids:
        query["store_id"] = {"$in": store_ids}
    return await db.hourly_aggregates.find(query, {"_id": 0}).to_list(500)


async def get_latest_counter_snapshots(store_ids: List[str] = None) -> List[dict]:
    """Get most recent counter snapshots"""
    pipeline = [
        {"$sort": {"timestamp": -1}},
        {"$group": {
            "_id": "$store_id",
            "latest": {"$first": "$$ROOT"}
        }},
        {"$replaceRoot": {"newRoot": "$latest"}},
        {"$project": {"_id": 0}}
    ]
    if store_ids:
        pipeline.insert(0, {"$match": {"store_id": {"$in": store_ids}}})
    
    return await db.counter_snapshots.aggregate(pipeline).to_list(500)


# ============== 1. DASHBOARD SUMMARY ==============

@router.get("/dashboard-summary")
async def get_dashboard_summary(
    store_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    user: dict = Depends(require_auth)
):
    """Get dashboard summary from local data warehouse"""
    from permissions import get_user_allowed_stores
    import logging
    logger = logging.getLogger(__name__)
    
    logger.info(f"Dashboard summary: store_id={store_id}, date_from={date_from}, date_to={date_to}")
    
    allowed_stores = await get_user_allowed_stores(user)
    
    # Build store filter
    store_ids = None
    if store_id:
        store_ids = [store_id]
        if allowed_stores is not None and store_id not in allowed_stores:
            return {"error": "Yetkisiz mağaza"}
    elif allowed_stores is not None:
        store_ids = list(allowed_stores) if allowed_stores else []
    
    # Determine date range
    now = datetime.now(timezone.utc)
    if date_from and date_to:
        start_date = date_from
        end_date = date_to
        # For comparison, use same duration before start_date
        days_diff = (datetime.strptime(date_to, "%Y-%m-%d") - datetime.strptime(date_from, "%Y-%m-%d")).days + 1
        compare_end = (datetime.strptime(date_from, "%Y-%m-%d") - timedelta(days=1)).strftime("%Y-%m-%d")
        compare_start = (datetime.strptime(date_from, "%Y-%m-%d") - timedelta(days=days_diff)).strftime("%Y-%m-%d")
    else:
        start_date = end_date = now.strftime("%Y-%m-%d")
        compare_start = compare_end = (now - timedelta(days=1)).strftime("%Y-%m-%d")
    
    # Get data for selected range
    range_data = await get_daily_summaries_for_range(start_date, end_date, store_ids)
    compare_data = await get_daily_summaries_for_range(compare_start, compare_end, store_ids)
    
    # Calculate totals
    range_visitors = sum(d.get("total_in", 0) for d in range_data)
    compare_visitors = sum(d.get("total_in", 0) for d in compare_data)
    
    # If no data in daily summaries, get from snapshots
    if range_visitors == 0:
        query = {"date": {"$gte": start_date, "$lte": end_date}}
        if store_ids:
            query["store_id"] = {"$in": store_ids}
        pipeline = [
            {"$match": query},
            {"$sort": {"hour": -1, "minute": -1}},
            {"$group": {"_id": {"store_id": "$store_id", "date": "$date"}, "total_in": {"$first": "$total_in"}}},
        ]
        snapshots = await db.counter_snapshots.aggregate(pipeline).to_list(10000)
        range_visitors = sum(s.get("total_in", 0) for s in snapshots)
    
    visitor_change = 0
    if compare_visitors > 0:
        visitor_change = round((range_visitors - compare_visitors) / compare_visitors * 100, 1)
    
    avg_occupancy = sum(d.get("avg_occupancy", 0) for d in range_data) / len(range_data) if range_data else 0
    avg_wait = sum(d.get("avg_wait_time_min", 0) for d in range_data) / len(range_data) if range_data else 0
    
    total_stores = await db.stores.count_documents({} if not store_ids else {"id": {"$in": store_ids}})
    
    # Get top performer
    top_store = max(range_data, key=lambda x: x.get("total_in", 0)) if range_data else None
    
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "store_id": store_id,
        "date_from": start_date,
        "date_to": end_date,
        "data_source": "local_warehouse",
        "quick_stats": {
            "total_stores": total_stores,
            "today_visitors": range_visitors,
            "visitor_change_percent": visitor_change,
            "avg_occupancy": round(avg_occupancy, 1),
            "avg_wait_time_min": round(avg_wait, 1)
        },
        "top_performers": {
            "highest_traffic": top_store.get("store_name") if top_store else "N/A",
            "highest_traffic_count": top_store.get("total_in", 0) if top_store else 0
        }
    }


# ============== 2. HOURLY TRAFFIC ==============

@router.get("/hourly-traffic")
async def get_hourly_traffic(
    store_id: Optional[str] = None,
    date: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    user: dict = Depends(require_auth)
):
    """Get hourly visitor traffic from local data warehouse"""
    from permissions import get_user_allowed_stores
    import logging
    logger = logging.getLogger(__name__)
    
    logger.info(f"Hourly traffic: store_id={store_id}, date={date}, date_from={date_from}, date_to={date_to}")
    
    allowed_stores = await get_user_allowed_stores(user)
    
    if store_id and allowed_stores is not None and store_id not in allowed_stores:
        return {"error": "Yetkisiz mağaza"}
    
    # Determine date range
    now = datetime.now(timezone.utc)
    if date_from and date_to:
        start_date = date_from
        end_date = date_to
    elif date:
        start_date = end_date = date
    else:
        start_date = end_date = now.strftime("%Y-%m-%d")
    
    store_ids = [store_id] if store_id else (list(allowed_stores) if allowed_stores else None)
    
    # Get snapshots for the date range
    query = {"date": {"$gte": start_date, "$lte": end_date}}
    if store_ids:
        query["store_id"] = {"$in": store_ids}
    
    snapshots = await db.counter_snapshots.find(query, {"_id": 0}).to_list(50000)
    
    logger.info(f"Hourly traffic: Found {len(snapshots)} snapshots")
    
    # Aggregate hourly data
    hourly_totals = defaultdict(lambda: {"in_count": 0, "out_count": 0, "visitors": 0, "count": 0})
    
    for snap in snapshots:
        hour = snap.get("hour", 0)
        hourly_totals[hour]["in_count"] += snap.get("total_in", 0)
        hourly_totals[hour]["out_count"] += snap.get("total_out", 0)
        hourly_totals[hour]["visitors"] += snap.get("current_visitors", 0)
        hourly_totals[hour]["count"] += 1
    
    result = []
    for hour in range(24):
        data = hourly_totals.get(hour, {"in_count": 0, "out_count": 0, "visitors": 0, "count": 0})
        count = data["count"] if data["count"] > 0 else 1
        result.append({
            "hour": hour,
            "hour_label": f"{hour:02d}:00",
            "in_count": round(data["in_count"] / count),
            "out_count": round(data["out_count"] / count),
            "avg_visitors": round(data["visitors"] / count, 1)
        })
    
    peak_hour = max(result, key=lambda x: x["in_count"])
    total_in = sum(r["in_count"] for r in result)
    total_out = sum(r["out_count"] for r in result)
    
    return {
        "date_from": start_date,
        "date_to": end_date,
        "store_id": store_id,
        "data_source": "local_warehouse",
        "hourly_data": result,
        "peak_hour": peak_hour["hour_label"],
        "peak_visitors": peak_hour["in_count"],
        "total_in": total_in,
        "total_out": total_out,
        "average_hourly": round(total_in / 24, 1) if total_in > 0 else 0
    }


# ============== 3. TRENDS ==============

@router.get("/trends")
async def get_visitor_trends(
    store_id: Optional[str] = None,
    period: str = "week",
    user: dict = Depends(require_auth)
):
    """Get visitor trends from local data warehouse"""
    from permissions import get_user_allowed_stores
    
    allowed_stores = await get_user_allowed_stores(user)
    
    if store_id and allowed_stores is not None and store_id not in allowed_stores:
        return {"error": "Yetkisiz mağaza"}
    
    now = datetime.now(timezone.utc)
    days = 7 if period == "week" else 30 if period == "month" else 90
    
    start_date = (now - timedelta(days=days)).strftime("%Y-%m-%d")
    end_date = now.strftime("%Y-%m-%d")
    
    store_ids = [store_id] if store_id else (list(allowed_stores) if allowed_stores else None)
    
    daily_data = await get_daily_summaries_for_range(start_date, end_date, store_ids)
    
    # Aggregate by date
    date_totals = defaultdict(lambda: {"in_count": 0, "out_count": 0})
    for record in daily_data:
        date = record.get("date")
        date_totals[date]["in_count"] += record.get("total_in", 0)
        date_totals[date]["out_count"] += record.get("total_out", 0)
    
    result = []
    for i in range(days):
        date = (now - timedelta(days=days-1-i)).strftime("%Y-%m-%d")
        day_name = (now - timedelta(days=days-1-i)).strftime("%A")
        data = date_totals.get(date, {"in_count": 0, "out_count": 0})
        result.append({
            "date": date,
            "day_name": day_name,
            "in_count": data["in_count"],
            "out_count": data["out_count"]
        })
    
    total_visitors = sum(r["in_count"] for r in result)
    avg_daily = round(total_visitors / days, 1) if days > 0 else 0
    
    # Week over week comparison
    wow_change = 0
    if len(result) >= 14:
        this_week = sum(r["in_count"] for r in result[-7:])
        last_week = sum(r["in_count"] for r in result[-14:-7])
        if last_week > 0:
            wow_change = round((this_week - last_week) / last_week * 100, 1)
    
    return {
        "period": period,
        "store_id": store_id,
        "data_source": "local_warehouse",
        "daily_data": result,
        "total_visitors": total_visitors,
        "average_daily": avg_daily,
        "week_over_week_change": wow_change
    }


# ============== 4. COMPARISON ==============

@router.get("/comparison")
async def get_period_comparison(
    store_id: Optional[str] = None,
    compare_type: str = "week",
    user: dict = Depends(require_auth)
):
    """Compare periods from local data warehouse"""
    from permissions import get_user_allowed_stores
    
    allowed_stores = await get_user_allowed_stores(user)
    
    if store_id and allowed_stores is not None and store_id not in allowed_stores:
        return {"error": "Yetkisiz mağaza"}
    
    now = datetime.now(timezone.utc)
    days = 7 if compare_type == "week" else 30
    
    current_end = now.strftime("%Y-%m-%d")
    current_start = (now - timedelta(days=days)).strftime("%Y-%m-%d")
    previous_end = (now - timedelta(days=days)).strftime("%Y-%m-%d")
    previous_start = (now - timedelta(days=days*2)).strftime("%Y-%m-%d")
    
    store_ids = [store_id] if store_id else (list(allowed_stores) if allowed_stores else None)
    
    current_data = await get_daily_summaries_for_range(current_start, current_end, store_ids)
    previous_data = await get_daily_summaries_for_range(previous_start, previous_end, store_ids)
    
    current_total = sum(d.get("total_in", 0) for d in current_data)
    previous_total = sum(d.get("total_in", 0) for d in previous_data)
    
    change_percent = 0
    if previous_total > 0:
        change_percent = round((current_total - previous_total) / previous_total * 100, 1)
    
    return {
        "compare_type": compare_type,
        "store_id": store_id,
        "data_source": "local_warehouse",
        "current_period": {
            "start": current_start,
            "end": current_end,
            "total_visitors": current_total
        },
        "previous_period": {
            "start": previous_start,
            "end": previous_end,
            "total_visitors": previous_total
        },
        "changes": {
            "visitor_change_percent": change_percent,
            "visitor_change_absolute": current_total - previous_total,
            "trend": "up" if change_percent > 0 else "down" if change_percent < 0 else "stable"
        }
    }


# ============== 5. DEMOGRAPHICS ==============

@router.get("/demographics")
async def get_demographics(
    store_id: Optional[str] = None,
    date: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    user: dict = Depends(require_auth)
):
    """Get demographics from local data warehouse or live VMS data"""
    from permissions import get_user_allowed_stores
    import logging
    logger = logging.getLogger(__name__)
    
    logger.info(f"Demographics: store_id={store_id}, date={date}, date_from={date_from}, date_to={date_to}")
    
    allowed_stores = await get_user_allowed_stores(user)
    
    if store_id and allowed_stores is not None and store_id not in allowed_stores:
        return {"error": "Yetkisiz mağaza"}
    
    # Determine date range
    now = datetime.now(timezone.utc)
    if date_from and date_to:
        start_date = date_from
        end_date = date_to
    elif date:
        start_date = end_date = date
    else:
        start_date = end_date = now.strftime("%Y-%m-%d")
    
    store_ids = [store_id] if store_id else (list(allowed_stores) if allowed_stores else None)
    
    # Get from analytics_snapshots for the date range
    analytics_query = {"date": {"$gte": start_date, "$lte": end_date}}
    if store_ids:
        analytics_query["store_id"] = {"$in": store_ids}
    
    analytics_data = await db.analytics_snapshots.find(analytics_query, {"_id": 0}).to_list(50000)
    
    logger.info(f"Demographics: Found {len(analytics_data)} analytics snapshots")
    
    # Calculate totals from snapshots
    total_male = 0
    total_female = 0
    age_totals = defaultdict(int)
    
    for record in analytics_data:
        total_male += record.get("male_count", 0)
        total_female += record.get("female_count", 0)
        age_dist = record.get("age_distribution", {})
        for age_group, count in age_dist.items():
            age_totals[age_group] += count
    
    # If no snapshot data, try daily_summaries
    if total_male == 0 and total_female == 0:
        daily_query = {"date": {"$gte": start_date, "$lte": end_date}}
        if store_ids:
            daily_query["store_id"] = {"$in": store_ids}
        
        daily_data = await db.daily_summaries.find(daily_query, {"_id": 0}).to_list(500)
        total_male = sum(d.get("male_count", 0) for d in daily_data)
        total_female = sum(d.get("female_count", 0) for d in daily_data)
    
    # If still no data, try fetching from VMS directly (last 24 hours)
    if total_male == 0 and total_female == 0:
        from server import _fetch_analytics_data
        try:
            # Get analytics camera IDs for the stores
            allowed_camera_ids = None
            if store_ids:
                stores = await db.stores.find({"id": {"$in": store_ids}}, {"_id": 0}).to_list(100)
                camera_ids = []
                for store in stores:
                    analytics_ids = store.get("analytics_camera_ids", [])
                    camera_ids.extend(analytics_ids)
                if camera_ids:
                    allowed_camera_ids = camera_ids
            
            vms_data = await _fetch_analytics_data(
                store_ids=",".join(store_ids) if store_ids else None,
                last_minutes=1440,  # Last 24 hours
                allowed_camera_ids=allowed_camera_ids
            )
            total_male = vms_data.get("gender_distribution", {}).get("Male", 0)
            total_female = vms_data.get("gender_distribution", {}).get("Female", 0)
            age_totals = defaultdict(int, vms_data.get("age_distribution", {}))
        except Exception as e:
            logger.error(f"Error fetching VMS data for demographics: {e}")
    
    total = total_male + total_female
    
    gender_data = [
        {"gender": "Male", "count": total_male, "percent": round(total_male / total * 100, 1) if total > 0 else 50},
        {"gender": "Female", "count": total_female, "percent": round(total_female / total * 100, 1) if total > 0 else 50}
    ]
    
    age_data = [{"age_group": k, "count": v} for k, v in sorted(age_totals.items())]
    
    primary_age = max(age_totals.items(), key=lambda x: x[1]) if age_totals else ("25-34", 0)
    secondary_ages = sorted(age_totals.items(), key=lambda x: x[1], reverse=True)
    secondary_age = secondary_ages[1] if len(secondary_ages) > 1 else primary_age
    
    return {
        "date": date,
        "store_id": store_id,
        "data_source": "local_warehouse" if analytics_data or total > 0 else "no_data",
        "gender_data": gender_data,
        "age_data": age_data,
        "total_count": total,
        "insights": {
            "primary_target": primary_age[0],
            "secondary_target": secondary_age[0],
            "recommendations": [
                f"{primary_age[0]} yaş grubuna yönelik kampanyalar düzenleyin",
                "Akşam saatlerinde personel sayısını artırın",
                "Hafta sonu promosyonlarına odaklanın"
            ]
        }
    }


# ============== 6. STORE COMPARISON ==============

@router.get("/store-comparison")
async def get_store_comparison(
    region_id: Optional[str] = None,
    user: dict = Depends(require_auth)
):
    """Compare stores from local data warehouse"""
    from permissions import get_user_allowed_stores
    
    allowed_stores = await get_user_allowed_stores(user)
    
    # Get last 7 days of data
    now = datetime.now(timezone.utc)
    start_date = (now - timedelta(days=7)).strftime("%Y-%m-%d")
    end_date = now.strftime("%Y-%m-%d")
    
    store_ids = list(allowed_stores) if allowed_stores else None
    
    daily_data = await get_daily_summaries_for_range(start_date, end_date, store_ids)
    
    # Aggregate by store
    store_totals = defaultdict(lambda: {
        "total_in": 0, "days": 0, "occupancy_sum": 0, "store_name": "", 
        "region_name": "", "city_name": ""
    })
    
    for record in daily_data:
        store_id = record.get("store_id")
        store_totals[store_id]["total_in"] += record.get("total_in", 0)
        store_totals[store_id]["days"] += 1
        store_totals[store_id]["occupancy_sum"] += record.get("avg_occupancy", 0)
        store_totals[store_id]["store_name"] = record.get("store_name", "")
        store_totals[store_id]["region_name"] = record.get("region_name", "")
        store_totals[store_id]["city_name"] = record.get("city_name", "")
    
    results = []
    for store_id, data in store_totals.items():
        days = data["days"] or 1
        results.append({
            "store_id": store_id,
            "store_name": data["store_name"],
            "region_name": data["region_name"],
            "city_name": data["city_name"],
            "total_visitors": data["total_in"],
            "visitors_per_day": round(data["total_in"] / days, 1),
            "occupancy_percent": round(data["occupancy_sum"] / days, 1),
            "conversion_rate": round(data["total_in"] / (days * 100) * 10, 1)  # Simplified metric
        })
    
    results.sort(key=lambda x: x["visitors_per_day"], reverse=True)
    
    for i, store in enumerate(results):
        store["rank"] = i + 1
    
    return {
        "period": f"{start_date} - {end_date}",
        "data_source": "local_warehouse",
        "stores": results,
        "total_stores": len(results)
    }


# ============== 7. REGION ANALYSIS ==============

@router.get("/region-analysis")
async def get_region_analysis(user: dict = Depends(require_auth)):
    """Analyze by region from local data warehouse"""
    from permissions import get_user_allowed_stores
    
    allowed_stores = await get_user_allowed_stores(user)
    
    now = datetime.now(timezone.utc)
    start_date = (now - timedelta(days=7)).strftime("%Y-%m-%d")
    end_date = now.strftime("%Y-%m-%d")
    
    store_ids = list(allowed_stores) if allowed_stores else None
    
    daily_data = await get_daily_summaries_for_range(start_date, end_date, store_ids)
    
    # Aggregate by region
    region_totals = defaultdict(lambda: {"total_in": 0, "store_count": set(), "region_name": ""})
    
    for record in daily_data:
        region_id = record.get("region_id")
        if region_id:
            region_totals[region_id]["total_in"] += record.get("total_in", 0)
            region_totals[region_id]["store_count"].add(record.get("store_id"))
            region_totals[region_id]["region_name"] = record.get("region_name", "")
    
    results = []
    for region_id, data in region_totals.items():
        store_count = len(data["store_count"])
        results.append({
            "region_id": region_id,
            "region_name": data["region_name"],
            "store_count": store_count,
            "total_visitors": data["total_in"],
            "avg_per_store": round(data["total_in"] / store_count, 1) if store_count > 0 else 0,
            "change_percent": 0,  # Would need more historical data
            "trend": "stable"
        })
    
    results.sort(key=lambda x: x["total_visitors"], reverse=True)
    
    return {
        "period": f"{start_date} - {end_date}",
        "data_source": "local_warehouse",
        "regions": results
    }


# ============== 8. CAPACITY UTILIZATION ==============

@router.get("/capacity-utilization")
async def get_capacity_utilization(user: dict = Depends(require_auth)):
    """Get capacity utilization from local data warehouse"""
    from permissions import get_user_allowed_stores
    
    allowed_stores = await get_user_allowed_stores(user)
    
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    store_ids = list(allowed_stores) if allowed_stores else None
    
    daily_data = await get_daily_summaries_for_range(today, today, store_ids)
    
    results = []
    optimal = 0
    under = 0
    over = 0
    
    for record in daily_data:
        util = record.get("avg_occupancy", 0)
        status = "optimal" if 40 <= util <= 80 else "under_utilized" if util < 40 else "over_capacity"
        
        if status == "optimal":
            optimal += 1
        elif status == "under_utilized":
            under += 1
        else:
            over += 1
        
        results.append({
            "store_id": record.get("store_id"),
            "store_name": record.get("store_name"),
            "capacity": record.get("capacity", 100),
            "utilization_percent": util,
            "status": status
        })
    
    return {
        "date": today,
        "data_source": "local_warehouse",
        "stores": results,
        "distribution": {
            "optimal": optimal,
            "under_utilized": under,
            "over_capacity": over
        }
    }


# ============== 9. FORECAST ==============

@router.get("/forecast")
async def get_forecast(
    store_id: Optional[str] = None,
    user: dict = Depends(require_auth)
):
    """Forecast based on historical patterns from local data warehouse"""
    from permissions import get_user_allowed_stores
    
    allowed_stores = await get_user_allowed_stores(user)
    
    if store_id and allowed_stores is not None and store_id not in allowed_stores:
        return {"error": "Yetkisiz mağaza"}
    
    now = datetime.now(timezone.utc)
    
    # Get last 4 weeks of data to find patterns
    start_date = (now - timedelta(days=28)).strftime("%Y-%m-%d")
    end_date = now.strftime("%Y-%m-%d")
    
    store_ids = [store_id] if store_id else (list(allowed_stores) if allowed_stores else None)
    
    daily_data = await get_daily_summaries_for_range(start_date, end_date, store_ids)
    
    # Calculate average by day of week
    day_averages = defaultdict(list)
    for record in daily_data:
        date_obj = datetime.strptime(record.get("date"), "%Y-%m-%d")
        day_of_week = date_obj.weekday()
        day_averages[day_of_week].append(record.get("total_in", 0))
    
    # Calculate averages
    day_avg = {}
    for day, values in day_averages.items():
        day_avg[day] = round(sum(values) / len(values), 0) if values else 0
    
    # Generate 7-day forecast
    forecast = []
    for i in range(1, 8):
        future_date = now + timedelta(days=i)
        day_of_week = future_date.weekday()
        predicted = day_avg.get(day_of_week, 0)
        
        forecast.append({
            "date": future_date.strftime("%Y-%m-%d"),
            "day_name": future_date.strftime("%A"),
            "predicted_visitors": int(predicted),
            "confidence": 75 if predicted > 0 else 50,
            "intensity": "high" if predicted > 1000 else "medium" if predicted > 500 else "low"
        })
    
    return {
        "store_id": store_id,
        "data_source": "local_warehouse",
        "daily_forecast": forecast,
        "recommendations": [
            "Hafta sonu için ekstra personel planlayın" if any(f["intensity"] == "high" for f in forecast) else "Normal personel yeterli"
        ],
        "peak_predictions": forecast
    }


# ============== 10. PEAK ALERTS ==============

@router.get("/peak-alerts")
async def get_peak_alerts(
    store_id: Optional[str] = None,
    user: dict = Depends(require_auth)
):
    """Get peak hour alerts from local data warehouse"""
    from permissions import get_user_allowed_stores
    
    allowed_stores = await get_user_allowed_stores(user)
    
    if store_id and allowed_stores is not None and store_id not in allowed_stores:
        return {"error": "Yetkisiz mağaza"}
    
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")
    
    store_ids = [store_id] if store_id else (list(allowed_stores) if allowed_stores else None)
    
    hourly_data = await get_hourly_data_for_date(today, store_ids)
    
    # Find peak periods
    peak_periods = []
    
    # Morning peak (10-12)
    # Lunch peak (12-14)
    # Evening peak (17-20)
    
    periods = [
        ("Sabah", 10, 12),
        ("Öğle", 12, 14),
        ("Akşam", 17, 20)
    ]
    
    for period_name, start_hour, end_hour in periods:
        total_visitors = 0
        for store_hourly in hourly_data:
            for h in store_hourly.get("hourly_data", []):
                if start_hour <= h.get("hour", 0) < end_hour:
                    total_visitors += h.get("in_count", 0)
        
        avg_occupancy = 60  # Default
        alert_level = "high" if total_visitors > 500 else "medium" if total_visitors > 200 else "low"
        
        peak_periods.append({
            "period": period_name,
            "start_time": f"{start_hour:02d}:00",
            "end_time": f"{end_hour:02d}:00",
            "expected_visitors": total_visitors,
            "expected_capacity_percent": avg_occupancy,
            "alert_level": alert_level
        })
    
    return {
        "date": today,
        "store_id": store_id,
        "data_source": "local_warehouse",
        "peak_periods": peak_periods
    }


# ============== 11. QUEUE ANALYTICS ==============

@router.get("/queue-analytics")
async def get_queue_analytics(user: dict = Depends(require_auth)):
    """Get queue analytics from local data warehouse"""
    from permissions import get_user_allowed_stores
    
    allowed_stores = await get_user_allowed_stores(user)
    
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    store_ids = list(allowed_stores) if allowed_stores else None
    
    # Get latest queue snapshots
    pipeline = [
        {"$match": {"date": today}},
        {"$sort": {"timestamp": -1}},
        {"$group": {
            "_id": "$store_id",
            "latest": {"$first": "$$ROOT"}
        }},
        {"$replaceRoot": {"newRoot": "$latest"}},
        {"$project": {"_id": 0}}
    ]
    
    if store_ids:
        pipeline[0]["$match"]["store_id"] = {"$in": store_ids}
    
    queue_data = await db.queue_snapshots.aggregate(pipeline).to_list(500)
    
    results = []
    total_wait = 0
    stores_attention = 0
    
    for record in queue_data:
        avg_wait = record.get("avg_wait_time_seconds", 0) / 60
        total_wait += avg_wait
        
        if avg_wait > 5:
            stores_attention += 1
        
        # Build checkout details from zone_details
        checkouts = []
        for i, zone in enumerate(record.get("zone_details", [])):
            checkouts.append({
                "checkout_number": i + 1,
                "queue_length": zone.get("queue_length", 0),
                "wait_time_min": round(zone.get("wait_time_seconds", 0) / 60, 1),
                "is_active": zone.get("queue_length", 0) > 0
            })
        
        results.append({
            "store_id": record.get("store_id"),
            "store_name": record.get("store_name"),
            "total_checkouts": len(checkouts),
            "active_checkouts": len([c for c in checkouts if c["is_active"]]),
            "avg_wait_time_min": round(avg_wait, 1),
            "efficiency_percent": max(0, 100 - avg_wait * 10),
            "status": "critical" if avg_wait > 10 else "warning" if avg_wait > 5 else "normal",
            "checkouts": checkouts
        })
    
    return {
        "date": today,
        "data_source": "local_warehouse",
        "stores": results,
        "summary": {
            "total_stores": len(results),
            "avg_wait_time_min": round(total_wait / len(results), 1) if results else 0,
            "stores_needing_attention": stores_attention
        }
    }
