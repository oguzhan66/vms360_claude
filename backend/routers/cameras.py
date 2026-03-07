"""Camera Management routes"""
from fastapi import APIRouter, HTTPException, Query, Depends
from typing import List, Optional
from pydantic import BaseModel

from database import db
from models import Camera, CameraCreate
from auth import require_auth

router = APIRouter(prefix="/cameras", tags=["Cameras"])


class BulkDeleteRequest(BaseModel):
    camera_ids: List[str]


class BulkStatusRequest(BaseModel):
    camera_ids: List[str]
    is_active: bool


@router.post("", response_model=Camera)
async def create_camera(input: CameraCreate):
    camera = Camera(**input.model_dump())
    doc = camera.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.cameras.insert_one(doc)
    return camera


@router.get("", response_model=List[Camera])
async def get_cameras(store_id: Optional[str] = Query(None)):
    query = {"store_id": store_id} if store_id else {}
    cameras = await db.cameras.find(query, {"_id": 0}).to_list(500)
    return cameras


@router.delete("/{camera_id}")
async def delete_camera(camera_id: str):
    result = await db.cameras.delete_one({"id": camera_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Camera not found")
    return {"status": "deleted"}


@router.patch("/{camera_id}/status")
async def update_camera_status(camera_id: str, is_active: bool, user: dict = Depends(require_auth)):
    """Update single camera active status"""
    result = await db.cameras.update_one(
        {"id": camera_id},
        {"$set": {"is_active": is_active}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Camera not found")
    
    status_text = "aktif" if is_active else "pasif"
    return {"status": "success", "message": f"Kamera {status_text} yapıldı"}


@router.post("/bulk-delete")
async def bulk_delete_cameras(request: BulkDeleteRequest, user: dict = Depends(require_auth)):
    """Delete multiple cameras at once"""
    if not request.camera_ids:
        raise HTTPException(status_code=400, detail="No camera IDs provided")
    
    # Delete cameras from database
    result = await db.cameras.delete_many({"id": {"$in": request.camera_ids}})
    
    # Also remove these camera IDs from store associations
    await db.stores.update_many(
        {},
        {
            "$pull": {
                "counter_camera_ids": {"$in": request.camera_ids},
                "queue_camera_ids": {"$in": request.camera_ids},
                "analytics_camera_ids": {"$in": request.camera_ids}
            }
        }
    )
    
    return {
        "status": "success",
        "deleted_count": result.deleted_count,
        "message": f"{result.deleted_count} kamera silindi"
    }


@router.post("/bulk-status")
async def bulk_update_camera_status(request: BulkStatusRequest, user: dict = Depends(require_auth)):
    """Update multiple cameras' active status at once"""
    if not request.camera_ids:
        raise HTTPException(status_code=400, detail="No camera IDs provided")
    
    result = await db.cameras.update_many(
        {"id": {"$in": request.camera_ids}},
        {"$set": {"is_active": request.is_active}}
    )
    
    status_text = "aktif" if request.is_active else "pasif"
    return {
        "status": "success",
        "updated_count": result.modified_count,
        "message": f"{result.modified_count} kamera {status_text} yapıldı"
    }
