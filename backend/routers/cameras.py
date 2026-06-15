"""Camera Management routes"""
from fastapi import APIRouter, HTTPException, Query, Depends, Header
from typing import List, Optional
from pydantic import BaseModel

from database import db
from models import Camera, CameraCreate
from auth import require_auth, resolve_tenant_filter, resolve_tenant_id

router = APIRouter(prefix="/cameras", tags=["Cameras"])


class BulkDeleteRequest(BaseModel):
    camera_ids: List[str]


class BulkStatusRequest(BaseModel):
    camera_ids: List[str]
    is_active: bool


@router.post("", response_model=Camera)
async def create_camera(input: CameraCreate, user: dict = Depends(require_auth), x_tenant_id: Optional[str] = Header(None)):
    data = input.model_dump()
    data["tenant_id"] = resolve_tenant_id(user, x_tenant_id)

    # Enforce camera limit
    tenant_id = data.get("tenant_id")
    if tenant_id:
        tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
        if tenant:
            current_count = await db.cameras.count_documents({"tenant_id": tenant_id})
            if current_count >= tenant.get("max_cameras", 50):
                raise HTTPException(
                    status_code=400,
                    detail=f"Maksimum kamera limitine ulaşıldı ({tenant.get('max_cameras', 50)})"
                )

    camera = Camera(**data)
    doc = camera.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.cameras.insert_one(doc)
    return camera


@router.get("", response_model=List[Camera])
async def get_cameras(store_id: Optional[str] = Query(None), user: dict = Depends(require_auth), x_tenant_id: Optional[str] = Header(None)):
    query = resolve_tenant_filter(user, x_tenant_id)
    if store_id:
        query["store_id"] = store_id
    cameras = await db.cameras.find(query, {"_id": 0}).to_list(500)
    return cameras


@router.delete("/{camera_id}")
async def delete_camera(camera_id: str, user: dict = Depends(require_auth), x_tenant_id: Optional[str] = Header(None)):
    query = {"id": camera_id, **resolve_tenant_filter(user, x_tenant_id)}
    result = await db.cameras.delete_one(query)
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Camera not found")
    return {"status": "deleted"}


@router.patch("/{camera_id}/status")
async def update_camera_status(camera_id: str, is_active: bool, user: dict = Depends(require_auth), x_tenant_id: Optional[str] = Header(None)):
    query = {"id": camera_id, **resolve_tenant_filter(user, x_tenant_id)}
    result = await db.cameras.update_one(query, {"$set": {"is_active": is_active}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Camera not found")
    status_text = "aktif" if is_active else "pasif"
    return {"status": "success", "message": f"Kamera {status_text} yapıldı"}


@router.post("/bulk-delete")
async def bulk_delete_cameras(request: BulkDeleteRequest, user: dict = Depends(require_auth), x_tenant_id: Optional[str] = Header(None)):
    if not request.camera_ids:
        raise HTTPException(status_code=400, detail="No camera IDs provided")

    tenant_filter = resolve_tenant_filter(user, x_tenant_id)
    query = {"id": {"$in": request.camera_ids}, **tenant_filter}
    result = await db.cameras.delete_many(query)

    store_filter = tenant_filter.copy()
    await db.stores.update_many(
        store_filter,
        {
            "$pull": {
                "counter_camera_ids": {"$in": request.camera_ids},
                "queue_camera_ids": {"$in": request.camera_ids},
                "analytics_camera_ids": {"$in": request.camera_ids},
            }
        },
    )

    return {
        "status": "success",
        "deleted_count": result.deleted_count,
        "message": f"{result.deleted_count} kamera silindi",
    }


@router.post("/bulk-status")
async def bulk_update_camera_status(request: BulkStatusRequest, user: dict = Depends(require_auth), x_tenant_id: Optional[str] = Header(None)):
    if not request.camera_ids:
        raise HTTPException(status_code=400, detail="No camera IDs provided")

    query = {"id": {"$in": request.camera_ids}, **resolve_tenant_filter(user, x_tenant_id)}
    result = await db.cameras.update_many(query, {"$set": {"is_active": request.is_active}})
    status_text = "aktif" if request.is_active else "pasif"
    return {
        "status": "success",
        "updated_count": result.modified_count,
        "message": f"{result.modified_count} kamera {status_text} yapıldı",
    }
