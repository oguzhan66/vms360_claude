"""Settings routes — per-tenant"""
from fastapi import APIRouter, Depends

from database import db
from models import Settings
from auth import require_auth, get_tenant_filter
from scheduler_state import reschedule_collection_jobs

router = APIRouter(prefix="/settings", tags=["Settings"])


def _settings_id(tenant_id: str | None) -> str:
    return f"settings_{tenant_id}" if tenant_id else "global_settings"


@router.get("", response_model=Settings)
async def get_settings(user: dict = Depends(require_auth)):
    tenant_id = None if user.get("role") == "super_admin" else user.get("tenant_id")
    settings_id = _settings_id(tenant_id)
    settings = await db.settings.find_one({"id": settings_id}, {"_id": 0})
    if not settings:
        default_settings = Settings(id=settings_id, tenant_id=tenant_id)
        doc = default_settings.model_dump()
        await db.settings.insert_one(doc)
        return default_settings
    return Settings(**settings)


@router.put("", response_model=Settings)
async def update_settings(input: Settings, user: dict = Depends(require_auth)):
    tenant_id = None if user.get("role") == "super_admin" else user.get("tenant_id")
    settings_id = _settings_id(tenant_id)
    # Enforce correct id and tenant_id regardless of body
    input.id = settings_id
    input.tenant_id = tenant_id
    await db.settings.update_one(
        {"id": settings_id},
        {"$set": input.model_dump()},
        upsert=True,
    )
    reschedule_collection_jobs(
        input.person_count_interval,
        input.analytics_interval,
        input.data_retention_days,
    )
    return input
