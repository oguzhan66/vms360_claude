"""Database connection module"""
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env', override=False)

logger = logging.getLogger(__name__)

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]


async def create_indexes():
    """Create MongoDB indexes for optimal query performance"""
    try:
        # Counter snapshots - query by store and time
        try:
            await db.counter_snapshots.create_index(
                [("store_id", 1), ("timestamp", -1)],
                background=True
            )
        except Exception as e:
            logger.warning(f"Index exists or error: {e}")
        
        try:
            await db.counter_snapshots.create_index(
                [("store_id", 1), ("date", 1), ("hour", 1), ("minute", 1)],
                unique=True,
                background=True,
                sparse=True  # Allow null values
            )
        except Exception as e:
            logger.warning(f"Index exists or error: {e}")
        
        # Queue snapshots - query by store and time
        try:
            await db.queue_snapshots.create_index(
                [("store_id", 1), ("timestamp", -1)],
                background=True
            )
        except Exception as e:
            logger.warning(f"Index exists or error: {e}")
        
        try:
            await db.queue_snapshots.create_index(
                [("store_id", 1), ("date", 1), ("hour", 1), ("minute", 1)],
                unique=True,
                background=True,
                sparse=True
            )
        except Exception as e:
            logger.warning(f"Index exists or error: {e}")
        
        # Analytics snapshots - query by store and date
        try:
            await db.analytics_snapshots.create_index(
                [("store_id", 1), ("timestamp", -1)],
                background=True
            )
        except Exception as e:
            logger.warning(f"Index exists or error: {e}")
        
        try:
            await db.analytics_snapshots.create_index(
                [("store_id", 1), ("date", 1), ("hour", 1), ("minute", 1)],
                unique=True,
                background=True,
                sparse=True
            )
        except Exception as e:
            logger.warning(f"Index exists or error: {e}")
        
        # Daily summaries - query by store and date
        try:
            await db.daily_summaries.create_index(
                [("store_id", 1), ("date", -1)],
                unique=True,
                background=True
            )
        except Exception as e:
            logger.warning(f"Index exists or error: {e}")
        
        # Hourly aggregates - query by store, date and hour
        try:
            await db.hourly_aggregates.create_index(
                [("store_id", 1), ("date", 1), ("hour", 1)],
                unique=True,
                background=True
            )
        except Exception as e:
            logger.warning(f"Index exists or error: {e}")
        
        # Store health - for monitoring data freshness
        try:
            await db.store_health.create_index(
                [("store_id", 1)],
                unique=True,
                background=True
            )
        except Exception as e:
            logger.warning(f"Index exists or error: {e}")
        
        # Stores - basic indexes
        try:
            await db.stores.create_index([("id", 1)], unique=True, background=True)
        except Exception as e:
            logger.warning(f"Index exists or error: {e}")
        
        try:
            await db.stores.create_index([("district_id", 1)], background=True)
        except Exception as e:
            logger.warning(f"Index exists or error: {e}")
        
        logger.info("MongoDB indexes created/verified successfully")
        return True
    except Exception as e:
        logger.error(f"Error creating indexes: {e}")
        return False
