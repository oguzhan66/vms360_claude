"""
Redis Cache Module for VMS360
Provides caching layer for frequently accessed data
"""
import os
import json
import logging
from typing import Optional, Any
from datetime import timedelta
import redis.asyncio as redis

logger = logging.getLogger(__name__)

# Redis connection
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")
redis_client: Optional[redis.Redis] = None

# Cache TTL settings (in seconds)
CACHE_TTL = {
    "dashboard_summary": 60,      # 1 dakika
    "counter_data": 60,           # 1 dakika
    "queue_data": 60,             # 1 dakika
    "analytics_data": 120,        # 2 dakika
    "store_list": 300,            # 5 dakika
    "health_status": 30,          # 30 saniye
    "hourly_data": 300,           # 5 dakika
    "daily_summary": 600,         # 10 dakika
}


async def init_redis():
    """Initialize Redis connection"""
    global redis_client
    try:
        redis_client = redis.from_url(REDIS_URL, decode_responses=True)
        await redis_client.ping()
        logger.info(f"Redis connected successfully: {REDIS_URL}")
        return True
    except Exception as e:
        logger.warning(f"Redis connection failed: {e}. Caching disabled.")
        redis_client = None
        return False


async def close_redis():
    """Close Redis connection"""
    global redis_client
    if redis_client:
        await redis_client.close()
        redis_client = None
        logger.info("Redis connection closed")


def _make_key(prefix: str, *args) -> str:
    """Generate cache key from prefix and arguments"""
    key_parts = [prefix] + [str(arg) for arg in args if arg is not None]
    return ":".join(key_parts)


async def get_cached(key: str) -> Optional[Any]:
    """Get value from cache"""
    if not redis_client:
        return None
    
    try:
        data = await redis_client.get(key)
        if data:
            logger.debug(f"Cache HIT: {key}")
            return json.loads(data)
        logger.debug(f"Cache MISS: {key}")
        return None
    except Exception as e:
        logger.error(f"Cache get error for {key}: {e}")
        return None


async def set_cached(key: str, value: Any, ttl_key: str = None, ttl_seconds: int = None):
    """Set value in cache with TTL"""
    if not redis_client:
        return False
    
    try:
        # Determine TTL
        if ttl_seconds is None:
            ttl_seconds = CACHE_TTL.get(ttl_key, 60)
        
        await redis_client.setex(key, ttl_seconds, json.dumps(value, default=str))
        logger.debug(f"Cache SET: {key} (TTL: {ttl_seconds}s)")
        return True
    except Exception as e:
        logger.error(f"Cache set error for {key}: {e}")
        return False


async def delete_cached(pattern: str):
    """Delete cached keys matching pattern"""
    if not redis_client:
        return
    
    try:
        keys = await redis_client.keys(pattern)
        if keys:
            await redis_client.delete(*keys)
            logger.debug(f"Cache DELETE: {len(keys)} keys matching {pattern}")
    except Exception as e:
        logger.error(f"Cache delete error for {pattern}: {e}")


async def invalidate_store_cache(store_id: str = None):
    """Invalidate all cache for a store or all stores"""
    patterns = [
        "counter:*",
        "queue:*",
        "analytics:*",
        "dashboard:*",
        "health:*",
    ]
    
    if store_id:
        patterns = [f"*:{store_id}:*", f"*:{store_id}"]
    
    for pattern in patterns:
        await delete_cached(pattern)


# ============== CACHED DATA FUNCTIONS ==============

async def get_cached_counter_data(store_id: str = None) -> Optional[list]:
    """Get cached counter data"""
    key = _make_key("counter", "all" if not store_id else store_id)
    return await get_cached(key)


async def set_cached_counter_data(data: list, store_id: str = None):
    """Cache counter data"""
    key = _make_key("counter", "all" if not store_id else store_id)
    await set_cached(key, data, "counter_data")


async def get_cached_queue_data(store_id: str = None) -> Optional[list]:
    """Get cached queue data"""
    key = _make_key("queue", "all" if not store_id else store_id)
    return await get_cached(key)


async def set_cached_queue_data(data: list, store_id: str = None):
    """Cache queue data"""
    key = _make_key("queue", "all" if not store_id else store_id)
    await set_cached(key, data, "queue_data")


async def get_cached_analytics_data(store_id: str = None) -> Optional[dict]:
    """Get cached analytics data"""
    key = _make_key("analytics", "all" if not store_id else store_id)
    return await get_cached(key)


async def set_cached_analytics_data(data: dict, store_id: str = None):
    """Cache analytics data"""
    key = _make_key("analytics", "all" if not store_id else store_id)
    await set_cached(key, data, "analytics_data")


async def get_cached_dashboard_summary(filters: dict = None) -> Optional[dict]:
    """Get cached dashboard summary"""
    filter_key = json.dumps(filters, sort_keys=True) if filters else "all"
    key = _make_key("dashboard", "summary", hash(filter_key))
    return await get_cached(key)


async def set_cached_dashboard_summary(data: dict, filters: dict = None):
    """Cache dashboard summary"""
    filter_key = json.dumps(filters, sort_keys=True) if filters else "all"
    key = _make_key("dashboard", "summary", hash(filter_key))
    await set_cached(key, data, "dashboard_summary")


async def get_cached_health_status() -> Optional[dict]:
    """Get cached health status"""
    key = "health:status"
    return await get_cached(key)


async def set_cached_health_status(data: dict):
    """Cache health status"""
    key = "health:status"
    await set_cached(key, data, "health_status")


async def get_cached_store_list() -> Optional[list]:
    """Get cached store list"""
    key = "stores:list"
    return await get_cached(key)


async def set_cached_store_list(data: list):
    """Cache store list"""
    key = "stores:list"
    await set_cached(key, data, "store_list")


# ============== CACHE STATS ==============

async def get_cache_stats() -> dict:
    """Get cache statistics"""
    if not redis_client:
        return {"status": "disabled", "message": "Redis not connected"}
    
    try:
        info = await redis_client.info("stats")
        memory = await redis_client.info("memory")
        keys = await redis_client.dbsize()
        
        return {
            "status": "connected",
            "keys_count": keys,
            "hits": info.get("keyspace_hits", 0),
            "misses": info.get("keyspace_misses", 0),
            "hit_rate": round(
                info.get("keyspace_hits", 0) / 
                max(info.get("keyspace_hits", 0) + info.get("keyspace_misses", 0), 1) * 100, 
                2
            ),
            "memory_used_mb": round(memory.get("used_memory", 0) / 1024 / 1024, 2),
            "memory_peak_mb": round(memory.get("used_memory_peak", 0) / 1024 / 1024, 2),
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}
