"""VMS Management routes"""
from fastapi import APIRouter, HTTPException, Depends, Header
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel

from database import db
from models import VMSServer, VMSServerCreate, VMSServerUpdate, Camera, ImportCamerasRequest
from vms_utils import fetch_vms_data, parse_counter_xml, parse_queue_xml
from auth import require_auth, resolve_tenant_filter, resolve_tenant_id

router = APIRouter(prefix="/vms", tags=["VMS"])


class GroupRenameRequest(BaseModel):
    new_name: str


@router.post("")
async def create_vms(input: VMSServerCreate, user: dict = Depends(require_auth), x_tenant_id: Optional[str] = Header(None)):
    data = input.model_dump()
    data["tenant_id"] = resolve_tenant_id(user, x_tenant_id)
    vms_obj = VMSServer(**data)
    doc = vms_obj.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.vms_servers.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("")
async def get_vms_list(user: dict = Depends(require_auth), x_tenant_id: Optional[str] = Header(None)):
    servers = await db.vms_servers.find(resolve_tenant_filter(user, x_tenant_id), {"_id": 0}).to_list(100)
    for s in servers:
        if isinstance(s.get("created_at"), str):
            s["created_at"] = s["created_at"]
    return servers


@router.get("/{vms_id}")
async def get_vms(vms_id: str, user: dict = Depends(require_auth), x_tenant_id: Optional[str] = Header(None)):
    query = {"id": vms_id, **resolve_tenant_filter(user, x_tenant_id)}
    server = await db.vms_servers.find_one(query, {"_id": 0})
    if not server:
        raise HTTPException(status_code=404, detail="VMS not found")
    return server


@router.put("/{vms_id}")
async def update_vms(vms_id: str, input: VMSServerUpdate, user: dict = Depends(require_auth), x_tenant_id: Optional[str] = Header(None)):
    update_data = {k: v for k, v in input.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    query = {"id": vms_id, **resolve_tenant_filter(user, x_tenant_id)}
    result = await db.vms_servers.update_one(query, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="VMS not found")
    return await get_vms(vms_id, user, x_tenant_id)


@router.delete("/{vms_id}")
async def delete_vms(vms_id: str, user: dict = Depends(require_auth), x_tenant_id: Optional[str] = Header(None)):
    query = {"id": vms_id, **resolve_tenant_filter(user, x_tenant_id)}
    result = await db.vms_servers.delete_one(query)
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="VMS not found")
    return {"status": "deleted"}


@router.put("/groups/{old_name}")
async def rename_vms_group(old_name: str, req: GroupRenameRequest, user: dict = Depends(require_auth), x_tenant_id: Optional[str] = Header(None)):
    query = {"group_name": old_name, **resolve_tenant_filter(user, x_tenant_id)}
    result = await db.vms_servers.update_many(query, {"$set": {"group_name": req.new_name.strip()}})
    return {"updated": result.modified_count}


@router.delete("/groups/{old_name}")
async def delete_vms_group(old_name: str, user: dict = Depends(require_auth), x_tenant_id: Optional[str] = Header(None)):
    query = {"group_name": old_name, **resolve_tenant_filter(user, x_tenant_id)}
    result = await db.vms_servers.update_many(query, {"$unset": {"group_name": ""}})
    return {"updated": result.modified_count}


@router.get("/{vms_id}/test")
async def test_vms_connection(vms_id: str):
    server = await db.vms_servers.find_one({"id": vms_id}, {"_id": 0})
    if not server:
        raise HTTPException(status_code=404, detail="VMS not found")
    
    data = await fetch_vms_data(server, "/rsapi/cameras")
    if data:
        return {"status": "connected", "message": "VMS bağlantısı başarılı"}
    return {"status": "error", "message": "VMS bağlantısı kurulamadı"}


@router.get("/{vms_id}/cameras")
async def fetch_vms_cameras(vms_id: str):
    """Fetch available cameras from VMS server with proper names"""
    from vms_utils import parse_camera_list_xml
    
    server = await db.vms_servers.find_one({"id": vms_id}, {"_id": 0})
    if not server:
        raise HTTPException(status_code=404, detail="VMS not found")
    
    # First, get ALL cameras with names from /rsapi/cameras endpoint
    camera_list_xml = await fetch_vms_data(server, "/rsapi/cameras")
    all_cameras = {}
    
    if camera_list_xml:
        parsed_list = parse_camera_list_xml(camera_list_xml)
        for cam in parsed_list.get('cameras', []):
            all_cameras[cam['camera_id']] = {
                'camera_id': cam['camera_id'],
                'name': cam['name'],
                'description': cam.get('description', ''),
                'disabled': cam.get('disabled', False),
                'model': cam.get('model', ''),
                'has_counter': False,
                'has_queue': False,
                'has_analytics': False,
                'type': 'general'
            }
    
    # Now check which cameras are used in counter module
    counter_data = await fetch_vms_data(server, "/rsapi/modules/counter/getstats")
    counter_camera_ids = set()
    if counter_data:
        parsed = parse_counter_xml(counter_data)
        for cam in parsed.get('cameras', parsed) if isinstance(parsed, dict) else parsed:
            if isinstance(cam, dict):
                cam_id = cam.get('camera_id')
                if cam_id:
                    counter_camera_ids.add(cam_id)
                    if cam_id in all_cameras:
                        all_cameras[cam_id]['has_counter'] = True
                        all_cameras[cam_id]['type'] = 'counter'
                        all_cameras[cam_id]['in_count'] = cam.get('in_count', 0)
                        all_cameras[cam_id]['out_count'] = cam.get('out_count', 0)
                        all_cameras[cam_id]['last_reset'] = cam.get('last_reset', '')
                    else:
                        # Camera in module but not in list - add it
                        all_cameras[cam_id] = {
                            'camera_id': cam_id,
                            'name': f"Sayaç Kamera {cam_id[:8]}",
                            'has_counter': True,
                            'has_queue': False,
                            'has_analytics': False,
                            'type': 'counter',
                            'in_count': cam.get('in_count', 0),
                            'out_count': cam.get('out_count', 0)
                        }
    
    # Check which cameras are used in queue module
    queue_data = await fetch_vms_data(server, "/rsapi/modules/queue/getstats")
    if queue_data:
        parsed = parse_queue_xml(queue_data)
        for cam in parsed.get('cameras', []):
            cam_id = cam.get('camera_id')
            if cam_id:
                if cam_id in all_cameras:
                    all_cameras[cam_id]['has_queue'] = True
                    all_cameras[cam_id]['zones'] = cam.get('zones', [])
                    if all_cameras[cam_id]['type'] == 'general':
                        all_cameras[cam_id]['type'] = 'queue'
                else:
                    all_cameras[cam_id] = {
                        'camera_id': cam_id,
                        'name': f"Kuyruk Kamera {cam_id[:8]}",
                        'has_counter': False,
                        'has_queue': True,
                        'has_analytics': False,
                        'type': 'queue',
                        'zones': cam.get('zones', [])
                    }
    
    # Check which cameras are used in analytics/FR module
    analytics_data = await fetch_vms_data(server, "/rsapi/modules/fr/analytics/getstats")
    if analytics_data:
        parsed = parse_counter_xml(analytics_data)  # Similar XML structure
        for cam in parsed.get('cameras', parsed) if isinstance(parsed, dict) else parsed:
            if isinstance(cam, dict):
                cam_id = cam.get('camera_id')
                if cam_id:
                    if cam_id in all_cameras:
                        all_cameras[cam_id]['has_analytics'] = True
                        if all_cameras[cam_id]['type'] == 'general':
                            all_cameras[cam_id]['type'] = 'analytics'
                    else:
                        all_cameras[cam_id] = {
                            'camera_id': cam_id,
                            'name': f"Analitik Kamera {cam_id[:8]}",
                            'has_counter': False,
                            'has_queue': False,
                            'has_analytics': True,
                            'type': 'analytics'
                        }
    
    # Mark cameras already in DB
    all_vms_ids = list(all_cameras.keys())
    existing_in_db = set()
    if all_vms_ids:
        docs = await db.cameras.find(
            {"camera_vms_id": {"$in": all_vms_ids}}, {"camera_vms_id": 1, "_id": 0}
        ).to_list(1000)
        existing_in_db = {d["camera_vms_id"] for d in docs}

    cameras = list(all_cameras.values())
    for cam in cameras:
        cam["in_db"] = cam["camera_id"] in existing_in_db

    # Sort: enabled first, then by name
    cameras.sort(key=lambda c: (c.get('disabled', False), c.get('name', '')))

    return {
        "vms_id": vms_id,
        "vms_name": server.get("name", ""),
        "cameras": cameras,
        "total": len(cameras)
    }


@router.post("/{vms_id}/import-cameras")
async def import_vms_cameras(vms_id: str, request: ImportCamerasRequest, user: dict = Depends(require_auth)):
    """Import cameras from VMS and save to database"""
    server = await db.vms_servers.find_one({"id": vms_id, **get_tenant_filter(user)}, {"_id": 0})
    if not server:
        raise HTTPException(status_code=404, detail="VMS not found")
    
    # Get cameras list from request
    camera_ids = request.camera_ids
    
    imported = 0
    skipped = 0
    
    # Fetch cameras from VMS first
    cameras_response = await fetch_vms_cameras(vms_id)
    vms_cameras = {c["camera_id"]: c for c in cameras_response.get("cameras", [])}
    
    for cam_id in camera_ids:
        cam_data = vms_cameras.get(cam_id, {"camera_id": cam_id, "type": "counter"})
        
        existing = await db.cameras.find_one({"camera_vms_id": cam_id})
        if existing:
            skipped += 1
            continue
        
        tenant_id = None if user.get("role") == "super_admin" else user.get("tenant_id")
        camera = Camera(
            store_id="",  # Will be assigned later
            camera_vms_id=cam_id,
            name=cam_data.get("name", f"Kamera {cam_id[:8]}"),
            type=cam_data.get("type", "counter"),
            tenant_id=tenant_id,
        )
        doc = camera.model_dump()
        doc['created_at'] = doc['created_at'].isoformat()
        await db.cameras.insert_one(doc)
        imported += 1
    
    return {
        "status": "success",
        "imported": imported,
        "skipped": skipped,
        "message": f"{imported} kamera eklendi, {skipped} kamera zaten mevcut"
    }


@router.post("/{vms_id}/sync-cameras")
async def sync_vms_cameras(vms_id: str, store_id: str = None):
    """Fetch and automatically import all cameras from VMS"""
    server = await db.vms_servers.find_one({"id": vms_id}, {"_id": 0})
    if not server:
        raise HTTPException(status_code=404, detail="VMS not found")
    
    cameras_response = await fetch_vms_cameras(vms_id)
    vms_cameras = cameras_response.get("cameras", [])
    
    if not vms_cameras:
        return {"status": "warning", "message": "VMS'de kamera bulunamadı", "imported": 0}
    
    if store_id:
        stores = [await db.stores.find_one({"id": store_id}, {"_id": 0})]
        stores = [s for s in stores if s]
    else:
        stores = await db.stores.find({"vms_id": vms_id}, {"_id": 0}).to_list(100)
    
    if not stores:
        return {"status": "warning", "message": "Bu VMS'e bağlı lokasyon bulunamadı", "imported": 0}
    
    total_imported = 0
    total_skipped = 0
    
    for store in stores:
        for cam_data in vms_cameras:
            existing = await db.cameras.find_one({
                "camera_vms_id": cam_data["camera_id"],
                "store_id": store["id"]
            })
            
            if existing:
                total_skipped += 1
                continue
            
            cam_type = cam_data.get("type", "counter")
            type_names = {"counter": "Sayaç", "queue": "Kuyruk", "analytics": "Analitik"}
            cam_name = f"{type_names.get(cam_type, 'Kamera')} - {cam_data['camera_id'][:8]}"
            
            camera = Camera(
                store_id=store["id"],
                camera_vms_id=cam_data["camera_id"],
                name=cam_name,
                type=cam_type
            )
            doc = camera.model_dump()
            doc['created_at'] = doc['created_at'].isoformat()
            await db.cameras.insert_one(doc)
            total_imported += 1
    
    return {
        "status": "success",
        "imported": total_imported,
        "skipped": total_skipped,
        "stores_count": len(stores),
        "message": f"{total_imported} kamera eklendi ({len(stores)} mağazaya)"
    }
