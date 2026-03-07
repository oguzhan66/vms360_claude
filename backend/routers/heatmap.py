"""Heatmap API routes"""
from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime, timezone, timedelta
from database import db

router = APIRouter(prefix="/heatmap", tags=["Heatmap"])


class HeatmapDataPoint(BaseModel):
    """A single heatmap data point"""
    timestamp: str
    store_id: str
    floor_id: str
    camera_id: str
    grid_x: int
    grid_y: int
    count: int


class HeatmapRequest(BaseModel):
    """Request for heatmap data"""
    store_id: str
    floor_id: str
    date_from: str  # ISO format
    date_to: str    # ISO format
    interval_minutes: int = 60  # Aggregation interval
    canvas_image: Optional[str] = None  # Base64 encoded canvas image for PDF export


@router.get("/live/{floor_id}")
async def get_live_heatmap(
    floor_id: str,
    store_id: Optional[str] = Query(None)
):
    """
    Get live heatmap data for a floor.
    Returns the latest counter data from cameras on this floor.
    """
    # Get floor
    floor = await db.floors.find_one({"id": floor_id}, {"_id": 0})
    if not floor:
        raise HTTPException(status_code=404, detail="Kat bulunamadi")
    
    # Get store
    store = await db.stores.find_one({"id": floor.get("store_id")}, {"_id": 0})
    if not store:
        raise HTTPException(status_code=404, detail="Magaza bulunamadi")
    
    # Get cameras on this floor
    cameras = await db.cameras.find({"floor_id": floor_id}, {"_id": 0}).to_list(100)
    
    # Get latest counter snapshot for this store
    latest_snapshot = await db.counter_snapshots.find_one(
        {"store_id": floor.get("store_id")},
        {"_id": 0},
        sort=[("timestamp", -1)]
    )
    
    # Build camera data with counts
    camera_data = []
    for cam in cameras:
        cam_count = 0
        if latest_snapshot:
            for cam_detail in latest_snapshot.get("camera_details", []):
                if cam_detail.get("camera_id") == cam.get("camera_vms_id"):
                    cam_count = cam_detail.get("in_count", 0)
                    break
        
        camera_data.append({
            "camera_id": cam.get("id") or cam.get("camera_vms_id"),
            "camera_vms_id": cam.get("camera_vms_id"),
            "name": cam.get("name", ""),
            "position_x": cam.get("position_x", 0),
            "position_y": cam.get("position_y", 0),
            "direction": cam.get("direction", 0),
            "fov_angle": cam.get("fov_angle", 90),
            "influence_radius": cam.get("influence_radius", 5),
            "current_count": cam_count
        })
    
    return {
        "floor_id": floor_id,
        "floor_name": floor.get("name", ""),
        "store_id": store.get("id"),
        "store_name": store.get("name", ""),
        "width_meters": floor.get("width_meters", 50),
        "height_meters": floor.get("height_meters", 30),
        "grid_size": floor.get("grid_size", 2),
        "plan_image_data": floor.get("plan_image_data"),
        "zones": floor.get("zones", []),  # Include zones for heatmap masking
        "cameras": camera_data,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "total_visitors": latest_snapshot.get("total_in", 0) if latest_snapshot else 0
    }


@router.get("/range/{floor_id}")
async def get_heatmap_range(
    floor_id: str,
    date_from: str = Query(..., description="Start date (ISO format)"),
    date_to: str = Query(..., description="End date (ISO format)"),
    interval_minutes: int = Query(60, description="Aggregation interval in minutes")
):
    """
    Get heatmap data for a specific time range.
    Returns aggregated data for simulation/playback.
    """
    # Get floor
    floor = await db.floors.find_one({"id": floor_id}, {"_id": 0})
    if not floor:
        raise HTTPException(status_code=404, detail="Kat bulunamadi")
    
    store_id = floor.get("store_id")
    
    # Parse dates
    try:
        start_date = datetime.fromisoformat(date_from.replace('Z', '+00:00'))
        end_date = datetime.fromisoformat(date_to.replace('Z', '+00:00'))
    except ValueError:
        raise HTTPException(status_code=400, detail="Gecersiz tarih formati")
    
    # Get cameras on this floor
    cameras = await db.cameras.find({"floor_id": floor_id}, {"_id": 0}).to_list(100)
    
    # Get counter snapshots in range
    snapshots = await db.counter_snapshots.find(
        {
            "store_id": store_id,
            "timestamp": {
                "$gte": start_date.isoformat(),
                "$lte": end_date.isoformat()
            }
        },
        {"_id": 0}
    ).sort("timestamp", 1).to_list(1000)
    
    # Build timeline data
    timeline_data = []
    for snapshot in snapshots:
        camera_counts = {}
        for cam_detail in snapshot.get("camera_details", []):
            camera_counts[cam_detail.get("camera_id")] = {
                "in_count": cam_detail.get("in_count", 0),
                "out_count": cam_detail.get("out_count", 0)
            }
        
        camera_data = []
        for cam in cameras:
            cam_vms_id = cam.get("camera_vms_id")
            counts = camera_counts.get(cam_vms_id, {"in_count": 0, "out_count": 0})
            
            camera_data.append({
                "camera_id": cam.get("id") or cam_vms_id,
                "camera_vms_id": cam_vms_id,
                "position_x": cam.get("position_x", 0),
                "position_y": cam.get("position_y", 0),
                "direction": cam.get("direction", 0),
                "fov_angle": cam.get("fov_angle", 90),
                "influence_radius": cam.get("influence_radius", 5),
                "in_count": counts["in_count"],
                "out_count": counts["out_count"]
            })
        
        timeline_data.append({
            "timestamp": snapshot.get("timestamp"),
            "total_in": snapshot.get("total_in", 0),
            "total_out": snapshot.get("total_out", 0),
            "cameras": camera_data
        })
    
    # Get hourly aggregates if available for longer ranges
    hourly_data = []
    if (end_date - start_date).days >= 1:
        hourly_aggs = await db.hourly_aggregates.find(
            {
                "store_id": store_id,
                "date": {
                    "$gte": start_date.strftime("%Y-%m-%d"),
                    "$lte": end_date.strftime("%Y-%m-%d")
                }
            },
            {"_id": 0}
        ).to_list(100)
        
        for agg in hourly_aggs:
            for hourly in agg.get("hourly_data", []):
                hourly_data.append({
                    "date": agg.get("date"),
                    "hour": hourly.get("hour"),
                    "in_count": hourly.get("in_count", 0),
                    "out_count": hourly.get("out_count", 0)
                })
    
    return {
        "floor_id": floor_id,
        "floor_name": floor.get("name", ""),
        "store_id": store_id,
        "width_meters": floor.get("width_meters", 50),
        "height_meters": floor.get("height_meters", 30),
        "grid_size": floor.get("grid_size", 2),
        "plan_image_data": floor.get("plan_image_data"),
        "zones": floor.get("zones", []),  # Include zones for heatmap masking
        "date_from": date_from,
        "date_to": date_to,
        "timeline_data": timeline_data,
        "hourly_summary": hourly_data,
        "total_snapshots": len(timeline_data)
    }


@router.get("/stores-with-floors")
async def get_stores_with_floors():
    """
    Get list of stores that have floor plans configured.
    Used for filtering in the heatmap page.
    """
    # Get all floors
    floors = await db.floors.find({}, {"_id": 0}).to_list(500)
    
    # Group by store
    stores_dict = {}
    for floor in floors:
        store_id = floor.get("store_id")
        if store_id not in stores_dict:
            store = await db.stores.find_one({"id": store_id}, {"_id": 0})
            if store:
                # Get location info
                district = await db.districts.find_one({"id": store.get("district_id")}, {"_id": 0})
                city = None
                region = None
                if district:
                    city = await db.cities.find_one({"id": district.get("city_id")}, {"_id": 0})
                    if city:
                        region = await db.regions.find_one({"id": city.get("region_id")}, {"_id": 0})
                
                stores_dict[store_id] = {
                    "store_id": store_id,
                    "store_name": store.get("name", ""),
                    "district_name": district.get("name", "") if district else "",
                    "city_name": city.get("name", "") if city else "",
                    "region_name": region.get("name", "") if region else "",
                    "floors": []
                }
        
        if store_id in stores_dict:
            stores_dict[store_id]["floors"].append({
                "floor_id": floor.get("id"),
                "floor_name": floor.get("name", ""),
                "floor_number": floor.get("floor_number", 0),
                "has_plan": bool(floor.get("plan_image_data"))
            })
    
    # Sort floors by floor_number
    for store in stores_dict.values():
        store["floors"].sort(key=lambda f: f.get("floor_number", 0))
    
    return list(stores_dict.values())


@router.post("/export/pdf")
async def export_heatmap_pdf(request: HeatmapRequest):
    """
    Export heatmap report as PDF.
    Expects canvas_image_base64 in the request for the heatmap visualization.
    """
    from weasyprint import HTML, CSS
    from io import BytesIO
    import base64
    
    # Get floor
    floor = await db.floors.find_one({"id": request.floor_id}, {"_id": 0})
    if not floor:
        raise HTTPException(status_code=404, detail="Kat bulunamadi")
    
    # Get store
    store = await db.stores.find_one({"id": request.store_id}, {"_id": 0})
    if not store:
        raise HTTPException(status_code=404, detail="Magaza bulunamadi")
    
    # Get snapshot data for statistics
    start_dt = datetime.fromisoformat(request.date_from.replace('Z', '+00:00')) if request.date_from else datetime.now(timezone.utc) - timedelta(days=1)
    end_dt = datetime.fromisoformat(request.date_to.replace('Z', '+00:00')) if request.date_to else datetime.now(timezone.utc)
    
    snapshots = await db.counter_snapshots.find({
        "store_id": request.store_id,
        "timestamp": {"$gte": start_dt.isoformat(), "$lte": end_dt.isoformat()}
    }, {"_id": 0}).to_list(1000)
    
    # Calculate statistics
    total_in = sum(s.get("total_in", 0) for s in snapshots)
    total_out = sum(s.get("total_out", 0) for s in snapshots)
    peak_visitors = max((s.get("total_in", 0) for s in snapshots), default=0)
    avg_visitors = total_in // len(snapshots) if snapshots else 0
    
    # Get cameras on this floor
    cameras = await db.cameras.find({"floor_id": request.floor_id}, {"_id": 0}).to_list(100)
    
    # Logo URL
    logo_url = ""
    
    # Canvas image (passed from frontend)
    canvas_image = getattr(request, 'canvas_image', None) or ""
    
    # Generate HTML report
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            @page {{
                size: A4 landscape;
                margin: 15mm;
            }}
            body {{
                font-family: 'Segoe UI', Arial, sans-serif;
                color: #1a1a2e;
                line-height: 1.4;
                font-size: 11px;
            }}
            .header {{
                display: flex;
                justify-content: space-between;
                align-items: center;
                border-bottom: 3px solid #3b82f6;
                padding-bottom: 15px;
                margin-bottom: 20px;
            }}
            .logo-section {{
                display: flex;
                align-items: center;
                gap: 12px;
            }}
            .logo {{
                width: 50px;
                height: 50px;
            }}
            .brand {{
                font-size: 24px;
                font-weight: bold;
                color: #3b82f6;
            }}
            .brand-sub {{
                font-size: 10px;
                color: #666;
                text-transform: uppercase;
                letter-spacing: 2px;
            }}
            .report-info {{
                text-align: right;
            }}
            .report-title {{
                font-size: 18px;
                font-weight: bold;
                color: #1a1a2e;
            }}
            .report-date {{
                font-size: 10px;
                color: #666;
            }}
            .content {{
                display: flex;
                gap: 20px;
            }}
            .heatmap-section {{
                flex: 2;
            }}
            .stats-section {{
                flex: 1;
            }}
            .heatmap-image {{
                width: 100%;
                border: 1px solid #ddd;
                border-radius: 8px;
            }}
            .section-title {{
                font-size: 14px;
                font-weight: bold;
                color: #3b82f6;
                margin-bottom: 10px;
                padding-bottom: 5px;
                border-bottom: 1px solid #e5e7eb;
            }}
            .stat-card {{
                background: linear-gradient(135deg, #f8fafc, #f1f5f9);
                border-radius: 8px;
                padding: 12px;
                margin-bottom: 10px;
            }}
            .stat-label {{
                font-size: 9px;
                color: #666;
                text-transform: uppercase;
            }}
            .stat-value {{
                font-size: 22px;
                font-weight: bold;
                color: #1a1a2e;
            }}
            .stat-unit {{
                font-size: 10px;
                color: #666;
            }}
            .info-grid {{
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 8px;
                margin-top: 15px;
            }}
            .info-item {{
                background: #f8fafc;
                padding: 8px;
                border-radius: 4px;
            }}
            .info-label {{
                font-size: 8px;
                color: #666;
                text-transform: uppercase;
            }}
            .info-value {{
                font-size: 11px;
                font-weight: 600;
                color: #1a1a2e;
            }}
            .camera-list {{
                margin-top: 15px;
            }}
            .camera-item {{
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 6px 0;
                border-bottom: 1px solid #f1f5f9;
            }}
            .camera-dot {{
                width: 8px;
                height: 8px;
                background: #3b82f6;
                border-radius: 50%;
            }}
            .footer {{
                margin-top: 20px;
                padding-top: 10px;
                border-top: 1px solid #e5e7eb;
                text-align: center;
                font-size: 9px;
                color: #999;
            }}
        </style>
    </head>
    <body>
        <div class="header">
            <div class="logo-section">
                <img src="{logo_url}" class="logo" alt="VMS360">
                <div>
                    <div class="brand">VMS360</div>
                    <div class="brand-sub">Retail Panel</div>
                </div>
            </div>
            <div class="report-info">
                <div class="report-title">Isı Haritası Raporu</div>
                <div class="report-date">Oluşturulma: {datetime.now().strftime('%d.%m.%Y %H:%M')}</div>
            </div>
        </div>
        
        <div class="content">
            <div class="heatmap-section">
                <div class="section-title">📍 {store.get('name', '')} - {floor.get('name', '')}</div>
                {f'<img src="{canvas_image}" class="heatmap-image" alt="Heatmap">' if canvas_image else '<div style="height:300px;background:#f1f5f9;display:flex;align-items:center;justify-content:center;border-radius:8px;">Isı haritası görseli</div>'}
                
                <div class="info-grid">
                    <div class="info-item">
                        <div class="info-label">Tarih Aralığı</div>
                        <div class="info-value">{start_dt.strftime('%d.%m.%Y')} - {end_dt.strftime('%d.%m.%Y')}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Alan Boyutu</div>
                        <div class="info-value">{floor.get('width_meters', 0)}m x {floor.get('height_meters', 0)}m</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Izgara Boyutu</div>
                        <div class="info-value">{floor.get('grid_size', 2)}m x {floor.get('grid_size', 2)}m</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Veri Noktası</div>
                        <div class="info-value">{len(snapshots)} kayıt</div>
                    </div>
                </div>
            </div>
            
            <div class="stats-section">
                <div class="section-title">📊 İstatistikler</div>
                
                <div class="stat-card">
                    <div class="stat-label">Toplam Giriş</div>
                    <div class="stat-value">{total_in:,}</div>
                    <div class="stat-unit">ziyaretçi</div>
                </div>
                
                <div class="stat-card">
                    <div class="stat-label">Toplam Çıkış</div>
                    <div class="stat-value">{total_out:,}</div>
                    <div class="stat-unit">ziyaretçi</div>
                </div>
                
                <div class="stat-card">
                    <div class="stat-label">Peak Ziyaretçi</div>
                    <div class="stat-value">{peak_visitors:,}</div>
                    <div class="stat-unit">anlık max</div>
                </div>
                
                <div class="stat-card">
                    <div class="stat-label">Ortalama</div>
                    <div class="stat-value">{avg_visitors:,}</div>
                    <div class="stat-unit">ziyaretçi/saat</div>
                </div>
                
                <div class="camera-list">
                    <div class="section-title">📷 Kameralar ({len(cameras)})</div>
                    {''.join(f'<div class="camera-item"><div class="camera-dot"></div><span>{cam.get("name", "Kamera")}</span></div>' for cam in cameras[:6])}
                    {f'<div style="font-size:9px;color:#999;margin-top:5px;">+{len(cameras)-6} daha...</div>' if len(cameras) > 6 else ''}
                </div>
            </div>
        </div>
        
        <div class="footer">
            VMS360 Retail Panel | {store.get('name', '')} | {store.get('location', '')} | Rapor ID: {request.floor_id[:8]}
        </div>
    </body>
    </html>
    """
    
    # Generate PDF
    try:
        html = HTML(string=html_content)
        pdf_buffer = BytesIO()
        html.write_pdf(pdf_buffer)
        pdf_buffer.seek(0)
        pdf_base64 = base64.b64encode(pdf_buffer.read()).decode('utf-8')
        
        return {
            "status": "success",
            "pdf_base64": pdf_base64,
            "filename": f"heatmap_report_{store.get('name', 'store')}_{floor.get('name', 'floor')}_{datetime.now().strftime('%Y%m%d_%H%M')}.pdf"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF oluşturma hatası: {str(e)}")
