"""Historical Data Router"""
from fastapi import APIRouter, Depends, BackgroundTasks
from typing import Optional
from datetime import datetime, timezone, timedelta

from database import db
from auth import require_auth, require_admin

router = APIRouter(prefix="/historical", tags=["Historical Data"])


@router.get("/counter")
async def get_historical_counter(
    store_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user: dict = Depends(require_auth)
):
    """Get historical counter data"""
    query = {}
    if store_id:
        query["store_id"] = store_id
    if start_date:
        query["date"] = {"$gte": start_date}
    if end_date:
        if "date" in query:
            query["date"]["$lte"] = end_date
        else:
            query["date"] = {"$lte": end_date}
    
    data = await db.historical_counter.find(query, {"_id": 0}).sort([("date", -1), ("hour", -1)]).to_list(1000)
    return data


@router.get("/queue")
async def get_historical_queue(
    store_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user: dict = Depends(require_auth)
):
    """Get historical queue data"""
    query = {}
    if store_id:
        query["store_id"] = store_id
    if start_date:
        query["date"] = {"$gte": start_date}
    if end_date:
        if "date" in query:
            query["date"]["$lte"] = end_date
        else:
            query["date"] = {"$lte": end_date}
    
    data = await db.historical_queue.find(query, {"_id": 0}).sort([("date", -1), ("hour", -1)]).to_list(1000)
    return data


@router.get("/analytics")
async def get_historical_analytics(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user: dict = Depends(require_auth)
):
    """Get historical analytics data"""
    query = {}
    if start_date:
        query["date"] = {"$gte": start_date}
    if end_date:
        if "date" in query:
            query["date"]["$lte"] = end_date
        else:
            query["date"] = {"$lte": end_date}
    
    data = await db.historical_analytics.find(query, {"_id": 0}).sort([("date", -1), ("hour", -1)]).to_list(1000)
    return data


@router.get("/summary")
async def get_historical_summary(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user: dict = Depends(require_auth)
):
    """Get summary of historical data"""
    # Default to last 7 days
    if not end_date:
        end_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if not start_date:
        start_date = (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%d")
    
    query = {"date": {"$gte": start_date, "$lte": end_date}}
    
    counter_data = await db.historical_counter.find(query, {"_id": 0}).to_list(10000)
    queue_data = await db.historical_queue.find(query, {"_id": 0}).to_list(10000)
    analytics_data = await db.historical_analytics.find(query, {"_id": 0}).to_list(10000)
    
    # Aggregate by date
    daily_stats = {}
    for record in counter_data:
        date = record["date"]
        if date not in daily_stats:
            daily_stats[date] = {"date": date, "total_in": 0, "total_out": 0, "avg_visitors": 0, "count": 0}
        daily_stats[date]["total_in"] += record["total_in"]
        daily_stats[date]["total_out"] += record["total_out"]
        daily_stats[date]["avg_visitors"] += record["current_visitors"]
        daily_stats[date]["count"] += 1
    
    # Calculate averages
    for date, stats in daily_stats.items():
        if stats["count"] > 0:
            stats["avg_visitors"] = round(stats["avg_visitors"] / stats["count"], 1)
    
    return {
        "start_date": start_date,
        "end_date": end_date,
        "total_records": {
            "counter": len(counter_data),
            "queue": len(queue_data),
            "analytics": len(analytics_data)
        },
        "daily_stats": list(daily_stats.values()),
        "total_in": sum(r["total_in"] for r in counter_data),
        "total_out": sum(r["total_out"] for r in counter_data)
    }


@router.post("/collect-now")
async def collect_historical_now(background_tasks: BackgroundTasks, admin: dict = Depends(require_admin)):
    """Manually trigger historical data collection"""
    from data_collector import collect_all_snapshots
    background_tasks.add_task(collect_all_snapshots)
    return {"status": "started", "message": "Veri toplama başlatıldı"}
