"""Floor Plan Management routes"""
from fastapi import APIRouter, HTTPException, Query, UploadFile, File, Form
from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import datetime, timezone
import uuid
import os
import base64

from database import db

router = APIRouter(prefix="/floors", tags=["Floors"])

# ============== MODELS ==============

class ZonePoint(BaseModel):
    x: float
    y: float

class Zone(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    type: str = "general"  # corridor, plaza, entrance, shop, restricted
    color: str = "#ffffff"
    show_heatmap: bool = True  # If True, heatmap will render inside this zone
    points: List[ZonePoint] = []  # Polygon points

class FloorBase(BaseModel):
    store_id: str
    name: str
    floor_number: int = 0  # 0 = ground floor, negative for basement
    width_meters: float = 50.0  # Real-world width in meters
    height_meters: float = 30.0  # Real-world height in meters
    grid_size: float = 2.0  # Heatmap grid size in meters (default 2x2)
    zones: List[Zone] = []  # Zones for masking heatmap

class FloorCreate(FloorBase):
    pass

class FloorUpdate(BaseModel):
    name: Optional[str] = None
    floor_number: Optional[int] = None
    width_meters: Optional[float] = None
    height_meters: Optional[float] = None
    grid_size: Optional[float] = None
    plan_image_data: Optional[str] = None  # Base64 encoded image
    zones: Optional[List[Zone]] = None  # Zones for masking heatmap

class Floor(FloorBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    plan_image_data: Optional[str] = None  # Base64 encoded image stored in DB
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CameraPosition(BaseModel):
    """Camera position on floor plan"""
    camera_id: str
    floor_id: str
    position_x: float  # X position in meters from left edge
    position_y: float  # Y position in meters from top edge
    direction: float = 0.0  # Viewing direction in degrees (0 = right, 90 = down, etc.)
    fov_angle: float = 90.0  # Field of view angle in degrees
    influence_radius: float = 5.0  # Radius of influence in meters

class CameraPositionUpdate(BaseModel):
    position_x: Optional[float] = None
    position_y: Optional[float] = None
    direction: Optional[float] = None
    fov_angle: Optional[float] = None
    influence_radius: Optional[float] = None


# ============== FLOOR CRUD ENDPOINTS ==============

@router.post("", response_model=dict)
async def create_floor(input: FloorCreate):
    """Create a new floor for a store"""
    # Check if store exists
    store = await db.stores.find_one({"id": input.store_id}, {"_id": 0})
    if not store:
        raise HTTPException(status_code=404, detail="Magaza bulunamadi")
    
    floor = Floor(**input.model_dump())
    doc = floor.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    
    await db.floors.insert_one(doc)
    
    # Return without _id
    doc.pop('_id', None)
    return doc


@router.get("", response_model=List[dict])
async def get_floors(
    store_id: Optional[str] = Query(None, description="Filter by store ID")
):
    """Get all floors, optionally filtered by store"""
    query = {}
    if store_id:
        query["store_id"] = store_id
    
    floors = await db.floors.find(query, {"_id": 0}).to_list(500)
    
    # Add store name to each floor
    for floor in floors:
        store = await db.stores.find_one({"id": floor.get("store_id")}, {"_id": 0})
        floor["store_name"] = store.get("name", "") if store else ""
    
    # Sort by store_id and then floor_number
    floors.sort(key=lambda f: (f.get("store_id", ""), f.get("floor_number", 0)))
    
    return floors


@router.get("/{floor_id}", response_model=dict)
async def get_floor(floor_id: str):
    """Get a specific floor by ID"""
    floor = await db.floors.find_one({"id": floor_id}, {"_id": 0})
    if not floor:
        raise HTTPException(status_code=404, detail="Kat bulunamadi")
    
    # Add store name
    store = await db.stores.find_one({"id": floor.get("store_id")}, {"_id": 0})
    floor["store_name"] = store.get("name", "") if store else ""
    
    # Get cameras positioned on this floor
    cameras = await db.cameras.find({"floor_id": floor_id}, {"_id": 0}).to_list(100)
    floor["cameras"] = cameras
    
    return floor


@router.put("/{floor_id}", response_model=dict)
async def update_floor(floor_id: str, input: FloorUpdate):
    """Update a floor"""
    update_data = {k: v for k, v in input.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="Guncellenecek veri yok")
    
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.floors.update_one({"id": floor_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Kat bulunamadi")
    
    return await get_floor(floor_id)


@router.delete("/{floor_id}")
async def delete_floor(floor_id: str):
    """Delete a floor"""
    # First, remove floor_id from all cameras on this floor
    await db.cameras.update_many(
        {"floor_id": floor_id},
        {"$unset": {"floor_id": "", "position_x": "", "position_y": "", "direction": "", "fov_angle": "", "influence_radius": ""}}
    )
    
    result = await db.floors.delete_one({"id": floor_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Kat bulunamadi")
    
    return {"status": "deleted", "message": "Kat silindi"}


# ============== FLOOR PLAN IMAGE UPLOAD ==============

@router.post("/{floor_id}/upload-plan")
async def upload_floor_plan(
    floor_id: str,
    file: UploadFile = File(...)
):
    """Upload a floor plan image for a floor"""
    # Check if floor exists
    floor = await db.floors.find_one({"id": floor_id}, {"_id": 0})
    if not floor:
        raise HTTPException(status_code=404, detail="Kat bulunamadi")
    
    # Validate file type
    allowed_types = ["image/jpeg", "image/png", "image/jpg"]
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400, 
            detail=f"Gecersiz dosya tipi. Izin verilen: {', '.join(allowed_types)}"
        )
    
    # Read and encode file to base64
    contents = await file.read()
    
    # Check file size (max 5MB)
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Dosya boyutu 5MB'dan buyuk olamaz")
    
    # Convert to base64 with data URL prefix
    base64_data = base64.b64encode(contents).decode('utf-8')
    data_url = f"data:{file.content_type};base64,{base64_data}"
    
    # Update floor with image data
    await db.floors.update_one(
        {"id": floor_id},
        {
            "$set": {
                "plan_image_data": data_url,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    return {
        "status": "success",
        "message": "Kat plani yuklendi",
        "floor_id": floor_id,
        "file_name": file.filename,
        "file_size": len(contents)
    }


# ============== CAMERA POSITION ENDPOINTS ==============

@router.put("/{floor_id}/cameras/{camera_id}/position")
async def update_camera_position(
    floor_id: str,
    camera_id: str,
    position: CameraPositionUpdate
):
    """Update camera position on a floor plan"""
    # Check if floor exists
    floor = await db.floors.find_one({"id": floor_id}, {"_id": 0})
    if not floor:
        raise HTTPException(status_code=404, detail="Kat bulunamadi")
    
    # Check if camera exists
    camera = await db.cameras.find_one({"id": camera_id}, {"_id": 0})
    if not camera:
        # Also check by camera_vms_id
        camera = await db.cameras.find_one({"camera_vms_id": camera_id}, {"_id": 0})
        if not camera:
            raise HTTPException(status_code=404, detail="Kamera bulunamadi")
    
    # Build update data
    update_data = {"floor_id": floor_id}
    if position.position_x is not None:
        update_data["position_x"] = position.position_x
    if position.position_y is not None:
        update_data["position_y"] = position.position_y
    if position.direction is not None:
        update_data["direction"] = position.direction
    if position.fov_angle is not None:
        update_data["fov_angle"] = position.fov_angle
    if position.influence_radius is not None:
        update_data["influence_radius"] = position.influence_radius
    
    # Update camera
    await db.cameras.update_one(
        {"id": camera.get("id") or camera.get("camera_vms_id")},
        {"$set": update_data}
    )
    
    return {
        "status": "success",
        "message": "Kamera konumu guncellendi",
        "camera_id": camera_id,
        "floor_id": floor_id,
        "position": update_data
    }


@router.get("/{floor_id}/cameras")
async def get_floor_cameras(floor_id: str):
    """Get all cameras positioned on a specific floor"""
    # Check if floor exists
    floor = await db.floors.find_one({"id": floor_id}, {"_id": 0})
    if not floor:
        raise HTTPException(status_code=404, detail="Kat bulunamadi")
    
    # Get cameras on this floor
    cameras = await db.cameras.find({"floor_id": floor_id}, {"_id": 0}).to_list(100)
    
    return {
        "floor_id": floor_id,
        "floor_name": floor.get("name", ""),
        "cameras": cameras,
        "total": len(cameras)
    }


@router.delete("/{floor_id}/cameras/{camera_id}/position")
async def remove_camera_from_floor(floor_id: str, camera_id: str):
    """Remove a camera from a floor (unset position data)"""
    # Check if floor exists
    floor = await db.floors.find_one({"id": floor_id}, {"_id": 0})
    if not floor:
        raise HTTPException(status_code=404, detail="Kat bulunamadi")
    
    # Remove position data from camera
    result = await db.cameras.update_one(
        {"$or": [{"id": camera_id}, {"camera_vms_id": camera_id}], "floor_id": floor_id},
        {"$unset": {"floor_id": "", "position_x": "", "position_y": "", "direction": "", "fov_angle": "", "influence_radius": ""}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Bu katta kamera bulunamadi")
    
    return {"status": "success", "message": "Kamera kattan kaldirildi"}


# ============== AVAILABLE CAMERAS FOR FLOOR ==============

@router.get("/{floor_id}/available-cameras")
async def get_available_cameras_for_floor(floor_id: str):
    """Get cameras that can be added to a floor (from same store's VMS)"""
    # Get floor
    floor = await db.floors.find_one({"id": floor_id}, {"_id": 0})
    if not floor:
        raise HTTPException(status_code=404, detail="Kat bulunamadi")
    
    # Get store
    store = await db.stores.find_one({"id": floor.get("store_id")}, {"_id": 0})
    if not store:
        raise HTTPException(status_code=404, detail="Magaza bulunamadi")
    
    # Get all cameras for this store
    store_camera_ids = []
    camera_types = {}  # Track which type each camera is
    for field in ["counter_camera_ids", "queue_camera_ids", "analytics_camera_ids"]:
        for cam_id in store.get(field, []):
            store_camera_ids.append(cam_id)
            cam_type = field.replace("_camera_ids", "")
            if cam_id not in camera_types:
                camera_types[cam_id] = cam_type
    
    # Remove duplicates
    store_camera_ids = list(set(store_camera_ids))
    
    # Get camera details from database - search by both camera_vms_id and id
    cameras = await db.cameras.find(
        {"$or": [
            {"camera_vms_id": {"$in": store_camera_ids}},
            {"id": {"$in": store_camera_ids}}
        ]},
        {"_id": 0}
    ).to_list(100)
    
    # Create a set of found camera IDs
    found_camera_ids = set()
    for cam in cameras:
        found_camera_ids.add(cam.get("camera_vms_id"))
        found_camera_ids.add(cam.get("id"))
    
    # For cameras not found in the cameras collection, create placeholder entries
    # This ensures all store cameras are available for placement
    for cam_id in store_camera_ids:
        if cam_id not in found_camera_ids:
            # Camera not in cameras collection - create a placeholder
            placeholder_cam = {
                "id": cam_id,
                "camera_vms_id": cam_id,
                "name": f"Kamera {cam_id[:8]}...",
                "type": camera_types.get(cam_id, "counter"),
                "is_active": True
            }
            cameras.append(placeholder_cam)
    
    # Separate into positioned and unpositioned
    positioned = [c for c in cameras if c.get("floor_id") == floor_id]
    available = [c for c in cameras if not c.get("floor_id")]
    
    return {
        "floor_id": floor_id,
        "store_id": store.get("id"),
        "positioned_cameras": positioned,
        "available_cameras": available,
        "total_store_cameras": len(store_camera_ids)
    }



# ============== ZONE MANAGEMENT ENDPOINTS ==============

class ZoneCreate(BaseModel):
    name: str
    type: str = "general"  # corridor, plaza, entrance, shop, restricted
    color: str = "#3b82f6"
    show_heatmap: bool = True
    points: List[dict]  # [{x: float, y: float}, ...]

class ZoneUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    color: Optional[str] = None
    show_heatmap: Optional[bool] = None
    points: Optional[List[dict]] = None


@router.post("/{floor_id}/zones")
async def add_zone_to_floor(floor_id: str, zone: ZoneCreate):
    """Add a new zone to a floor"""
    # Check if floor exists
    floor = await db.floors.find_one({"id": floor_id}, {"_id": 0})
    if not floor:
        raise HTTPException(status_code=404, detail="Kat bulunamadi")
    
    new_zone = {
        "id": str(uuid.uuid4()),
        "name": zone.name,
        "type": zone.type,
        "color": zone.color,
        "show_heatmap": zone.show_heatmap,
        "points": zone.points
    }
    
    # Add zone to floor's zones array
    await db.floors.update_one(
        {"id": floor_id},
        {
            "$push": {"zones": new_zone},
            "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}
        }
    )
    
    return {
        "status": "success",
        "message": "Bölge eklendi",
        "zone": new_zone
    }


@router.get("/{floor_id}/zones")
async def get_floor_zones(floor_id: str):
    """Get all zones for a floor"""
    floor = await db.floors.find_one({"id": floor_id}, {"_id": 0})
    if not floor:
        raise HTTPException(status_code=404, detail="Kat bulunamadi")
    
    return {
        "floor_id": floor_id,
        "floor_name": floor.get("name", ""),
        "zones": floor.get("zones", []),
        "total": len(floor.get("zones", []))
    }


@router.put("/{floor_id}/zones/{zone_id}")
async def update_floor_zone(floor_id: str, zone_id: str, zone: ZoneUpdate):
    """Update a specific zone"""
    floor = await db.floors.find_one({"id": floor_id}, {"_id": 0})
    if not floor:
        raise HTTPException(status_code=404, detail="Kat bulunamadi")
    
    zones = floor.get("zones", [])
    zone_found = False
    
    for i, z in enumerate(zones):
        if z.get("id") == zone_id:
            zone_found = True
            if zone.name is not None:
                zones[i]["name"] = zone.name
            if zone.type is not None:
                zones[i]["type"] = zone.type
            if zone.color is not None:
                zones[i]["color"] = zone.color
            if zone.show_heatmap is not None:
                zones[i]["show_heatmap"] = zone.show_heatmap
            if zone.points is not None:
                zones[i]["points"] = zone.points
            break
    
    if not zone_found:
        raise HTTPException(status_code=404, detail="Bölge bulunamadi")
    
    await db.floors.update_one(
        {"id": floor_id},
        {
            "$set": {
                "zones": zones,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    return {"status": "success", "message": "Bölge güncellendi", "zones": zones}


@router.delete("/{floor_id}/zones/{zone_id}")
async def delete_floor_zone(floor_id: str, zone_id: str):
    """Delete a zone from a floor"""
    floor = await db.floors.find_one({"id": floor_id}, {"_id": 0})
    if not floor:
        raise HTTPException(status_code=404, detail="Kat bulunamadi")
    
    zones = floor.get("zones", [])
    new_zones = [z for z in zones if z.get("id") != zone_id]
    
    if len(zones) == len(new_zones):
        raise HTTPException(status_code=404, detail="Bölge bulunamadi")
    
    await db.floors.update_one(
        {"id": floor_id},
        {
            "$set": {
                "zones": new_zones,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    return {"status": "success", "message": "Bölge silindi"}
