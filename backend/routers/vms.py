"""VMS Management routes"""
from fastapi import APIRouter, HTTPException
from typing import List
from datetime import datetime

from database import db
from models import VMSServer, VMSServerCreate, VMSServerUpdate, Camera, ImportCamerasRequest
from vms_utils import fetch_vms_data, parse_counter_xml, parse_queue_xml

router = APIRouter(prefix="/vms", tags=["VMS"])


@router.post("", response_model=VMSServer)
async def create_vms(input: VMSServerCreate):
    vms_obj = VMSServer(**input.model_dump())
    doc = vms_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.vms_servers.insert_one(doc)
    return vms_obj


@router.get("", response_model=List[VMSServer])
async def get_vms_list():
    servers = await db.vms_servers.find({}, {"_id": 0}).to_list(100)
    for s in servers:
        if isinstance(s.get('created_at'), str):
            s['created_at'] = datetime.fromisoformat(s['created_at'])
    return servers


@router.get("/{vms_id}", response_model=VMSServer)
async def get_vms(vms_id: str):
    server = await db.vms_servers.find_one({"id": vms_id}, {"_id": 0})
    if not server:
        raise HTTPException(status_code=404, detail="VMS not found")
    if isinstance(server.get('created_at'), str):
        server['created_at'] = datetime.fromisoformat(server['created_at'])
    return server


@router.put("/{vms_id}", response_model=VMSServer)
async def update_vms(vms_id: str, input: VMSServerUpdate):
    update_data = {k: v for k, v in input.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    result = await db.vms_servers.update_one({"id": vms_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="VMS not found")
    return await get_vms(vms_id)


@router.delete("/{vms_id}")
async def delete_vms(vms_id: str):
    result = await db.vms_servers.delete_one({"id": vms_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="VMS not found")
    return {"status": "deleted"}


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
    
    # Convert to list and filter out disabled cameras optionally
    cameras = list(all_cameras.values())
    
    # Sort: enabled first, then by name
    cameras.sort(key=lambda c: (c.get('disabled', False), c.get('name', '')))
    
    return {
        "vms_id": vms_id,
        "vms_name": server.get("name", ""),
        "cameras": cameras,
        "total": len(cameras)
    }


@router.post("/{vms_id}/import-cameras")
async def import_vms_cameras(vms_id: str, request: ImportCamerasRequest):
    """Import cameras from VMS and save to database"""
    server = await db.vms_servers.find_one({"id": vms_id}, {"_id": 0})
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
        
        camera = Camera(
            store_id="",  # Will be assigned later
            camera_vms_id=cam_id,
            name=cam_data.get("name", f"Kamera {cam_id[:8]}"),
            type=cam_data.get("type", "counter")
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
        return {"status": "warning", "message": "Bu VMS'e bağlı mağaza bulunamadı", "imported": 0}
    
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
