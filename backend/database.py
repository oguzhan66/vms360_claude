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
        # Counter snapshots - query by tenant+store and time
        try:
            await db.counter_snapshots.create_index(
                [("tenant_id", 1), ("store_id", 1), ("timestamp", -1)],
                background=True
            )
        except Exception as e:
            logger.warning(f"Index exists or error: {e}")

        try:
            await db.counter_snapshots.create_index(
                [("store_id", 1), ("date", 1), ("hour", 1), ("minute", 1)],
                unique=True,
                background=True,
                sparse=True
            )
        except Exception as e:
            logger.warning(f"Index exists or error: {e}")

        # Queue snapshots
        try:
            await db.queue_snapshots.create_index(
                [("tenant_id", 1), ("store_id", 1), ("timestamp", -1)],
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

        # Analytics snapshots
        try:
            await db.analytics_snapshots.create_index(
                [("tenant_id", 1), ("store_id", 1), ("timestamp", -1)],
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

        # Daily summaries
        try:
            await db.daily_summaries.create_index(
                [("tenant_id", 1), ("store_id", 1), ("date", -1)],
                background=True
            )
        except Exception as e:
            logger.warning(f"Index exists or error: {e}")

        # Hourly aggregates
        try:
            await db.hourly_aggregates.create_index(
                [("tenant_id", 1), ("store_id", 1), ("date", 1), ("hour", 1)],
                background=True
            )
        except Exception as e:
            logger.warning(f"Index exists or error: {e}")

        # Store health
        try:
            await db.store_health.create_index(
                [("store_id", 1)],
                unique=True,
                background=True
            )
        except Exception as e:
            logger.warning(f"Index exists or error: {e}")

        # Stores
        try:
            await db.stores.create_index([("id", 1)], unique=True, background=True)
        except Exception as e:
            logger.warning(f"Index exists or error: {e}")

        try:
            await db.stores.create_index([("tenant_id", 1), ("district_id", 1)], background=True)
        except Exception as e:
            logger.warning(f"Index exists or error: {e}")

        # Tenants
        try:
            await db.tenants.create_index([("id", 1)], unique=True, background=True)
        except Exception as e:
            logger.warning(f"Index exists or error: {e}")

        try:
            await db.tenants.create_index([("slug", 1)], unique=True, background=True)
        except Exception as e:
            logger.warning(f"Index exists or error: {e}")

        # Users - tenant-scoped username lookups
        try:
            await db.users.create_index([("tenant_id", 1), ("username", 1)], background=True)
        except Exception as e:
            logger.warning(f"Index exists or error: {e}")

        # Cameras
        try:
            await db.cameras.create_index([("tenant_id", 1), ("store_id", 1)], background=True)
        except Exception as e:
            logger.warning(f"Index exists or error: {e}")

        # VMS servers
        try:
            await db.vms_servers.create_index([("tenant_id", 1)], background=True)
        except Exception as e:
            logger.warning(f"Index exists or error: {e}")

        logger.info("MongoDB indexes created/verified successfully")
        return True
    except Exception as e:
        logger.error(f"Error creating indexes: {e}")
        return False
