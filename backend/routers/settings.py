"""Settings routes"""
from fastapi import APIRouter

from database import db
from models import Settings

router = APIRouter(prefix="/settings", tags=["Settings"])


@router.get("", response_model=Settings)
async def get_settings():
    settings = await db.settings.find_one({"id": "global_settings"}, {"_id": 0})
    if not settings:
        default_settings = Settings()
        doc = default_settings.model_dump()
        await db.settings.insert_one(doc)
        return default_settings
    return Settings(**settings)


@router.put("", response_model=Settings)
async def update_settings(input: Settings):
    await db.settings.update_one(
        {"id": "global_settings"},
        {"$set": input.model_dump()},
        upsert=True
    )
    return input
