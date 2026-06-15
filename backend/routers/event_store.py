"""
VMS Event Store — scheduled collection + query API.

Scheduler her 30 dk'da VMS'ten son 35 dk'lık eventleri çeker ve
MongoDB vms_event_store koleksiyonuna yazar.  Raporlar ve dashboard
doğrudan bu koleksiyonu okur; VMS'e tekrar sorgu atmaz.
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from typing import Optional
from collections import defaultdict
from datetime import datetime, timezone, timedelta
import logging

from database import db
from vms_utils import fetch_vms_data
from routers.vms_events import parse_events_xml
from auth import require_auth

router = APIRouter(prefix="/event-store", tags=["Event Store"])
logger = logging.getLogger(__name__)

LEVEL_LABEL = {"0": "Bildirim", "1": "Alarm", "2": "Hata"}


# ── collection job ────────────────────────────────────────────────────────────

async def _get_disabled_types() -> set:
    """Settings'ten devre dışı olay tiplerini çeker."""
    raw = await db.settings.find_one({"id": "global_settings"}, {"_id": 0})
    if raw:
        return set(raw.get("disabled_event_types") or [])
    return set()


async def collect_vms_events():
    """Her 30 dk'da bir çalışır: VMS → MongoDB vms_event_store."""
    try:
        servers = await db.vms_servers.find({"is_active": True}, {"_id": 0}).to_list(50)
        if not servers:
            return

        disabled_types = await _get_disabled_types()

        # 35 dk → 5 dk overlap ile kayıp önleme
        xml_data_list = []
        for vms in servers:
            xml_data = await fetch_vms_data(vms, "/rsapi/searchevents?lastminutes=35&levels=0,1,2", timeout=30.0)
            if xml_data:
                xml_data_list.append((vms, xml_data))

        total_new = 0
        total_dup = 0

        for vms, xml_data in xml_data_list:
            events = parse_events_xml(xml_data)
            for ev in events:
                ev_id = ev.get("id")
                if not ev_id:
                    continue

                # Devre dışı tiplerden gelen eventleri atla
                if disabled_types and ev.get("type", "") in disabled_types:
                    total_dup += 1  # sayaçta göster ama "filtered" olarak
                    continue

                exists = await db.vms_event_store.find_one({"event_id": ev_id}, {"_id": 1})
                if exists:
                    total_dup += 1
                    continue

                # Parse time string → datetime
                time_raw = ev.get("time", "")
                try:
                    # "2026-06-15T11:28:15.136" → datetime (UTC olarak işaretle)
                    dt = datetime.fromisoformat(time_raw.replace("Z", "+00:00"))
                    if dt.tzinfo is None:
                        dt = dt.replace(tzinfo=timezone.utc)
                except (ValueError, AttributeError):
                    dt = datetime.now(timezone.utc)

                doc = {
                    "event_id":    ev_id,
                    "vms_id":      vms.get("id", ""),
                    "vms_name":    vms.get("name", ""),
                    "type":        ev.get("type", ""),
                    "type_desc":   ev.get("type_desc", ""),
                    "level":       ev.get("level", "0"),
                    "time":        dt,
                    "camera_id":   ev.get("camera_id", ""),
                    "camera_name": ev.get("camera_name", ""),
                    "short_desc":  ev.get("short_desc", ""),
                    "plate":       ev.get("plate", ""),
                    "direction":   ev.get("direction", ""),
                    "passage":     ev.get("passage", ""),
                    "collected_at": datetime.now(timezone.utc),
                }
                await db.vms_event_store.insert_one(doc)
                total_new += 1

        logger.info(f"VMS event collection: +{total_new} new, {total_dup} duplicates skipped")
    except Exception as e:
        logger.error(f"collect_vms_events error: {e}")


async def create_event_store_indexes():
    """Koleksiyon indexlerini oluştur (startup'ta bir kez çalışır)."""
    await db.vms_event_store.create_index("event_id", unique=True)
    await db.vms_event_store.create_index([("time", -1)])
    await db.vms_event_store.create_index("level")
    await db.vms_event_store.create_index("camera_id")
    await db.vms_event_store.create_index("type")
    await db.vms_event_store.create_index("plate")
    await db.vms_event_store.create_index([("camera_id", 1), ("time", -1)])
    logger.info("vms_event_store indexes OK")


# ── helpers ───────────────────────────────────────────────────────────────────

def _time_filter(time_from: Optional[str], time_to: Optional[str]) -> dict:
    q = {}
    try:
        if time_from:
            q["$gte"] = datetime.fromisoformat(time_from.replace("Z", "+00:00")).replace(tzinfo=timezone.utc)
        if time_to:
            q["$lte"] = datetime.fromisoformat(time_to.replace("Z", "+00:00")).replace(tzinfo=timezone.utc)
    except ValueError:
        pass
    return {"time": q} if q else {}


def _extract_hour(dt) -> Optional[int]:
    if isinstance(dt, datetime):
        return dt.hour
    return None


# ── routes ────────────────────────────────────────────────────────────────────

@router.get("/types")
async def get_event_types(user: dict = Depends(require_auth)):
    """DB'deki distinct olay tiplerini döner (settings için)."""
    types = await db.vms_event_store.distinct("type")
    types = sorted(t for t in types if t)

    # Settings'ten disabled listesini de ekle
    disabled = list(await _get_disabled_types())

    # Türkçe etiketler (bilinen tipler için)
    LABELS = {
        "LPR":              "Plaka Tanıma (LPR)",
        "NNEvent":          "Neural Network (Hareket/Bölge)",
        "Motion":           "Hareket Algılama",
        "FaceRecognition":  "Yüz Tanıma",
        "FR":               "Yüz Tanıma",
        "Queue":            "Kuyruk Algılama",
        "VideoLoss":        "Video Kaybı",
        "Connection":       "Bağlantı",
        "DiskFull":         "Disk Dolu",
        "Analytics":        "Analitik",
        "Alarm":            "Alarm",
    }

    return {
        "types": [
            {
                "type":     t,
                "label":    LABELS.get(t, t),
                "enabled":  t not in disabled,
                "count":    await db.vms_event_store.count_documents({"type": t}),
            }
            for t in types
        ],
        "disabled": disabled,
    }


@router.get("/status")
async def collection_status(user: dict = Depends(require_auth)):
    """Koleksiyon durumu: toplam kayıt, en eski/yeni event."""
    total = await db.vms_event_store.count_documents({})
    newest = await db.vms_event_store.find_one({}, {"time": 1, "_id": 0}, sort=[("time", -1)])
    oldest = await db.vms_event_store.find_one({}, {"time": 1, "_id": 0}, sort=[("time", 1)])
    return {
        "total_events": total,
        "newest_event": newest["time"].isoformat() if newest else None,
        "oldest_event": oldest["time"].isoformat() if oldest else None,
    }


@router.post("/collect-now")
async def trigger_collection(
    minutes: int = Query(35, ge=1, le=20160, description="Kaç dakika geriye dönük toplanacak (max 14 gün=20160)"),
    user: dict = Depends(require_auth),
):
    """Manuel tetikleme — ilk kurulum için büyük minutes değeri kullanın (ör. 10080 = 7 gün)."""
    if user.get("role") not in ("super_admin", "admin"):
        raise HTTPException(403, "Yetkiniz yok")
    import asyncio
    asyncio.create_task(_collect_with_minutes(minutes))
    return {"status": "started", "message": f"Son {minutes} dk event toplama başlatıldı (arka planda)"}


async def _collect_with_minutes(minutes: int):
    """collect_vms_events'in belirli bir süre için versiyonu."""
    try:
        servers = await db.vms_servers.find({"is_active": True}, {"_id": 0}).to_list(50)
        if not servers:
            return
        disabled_types = await _get_disabled_types()
        total_new = 0
        total_dup = 0
        for vms in servers:
            xml_data = await fetch_vms_data(
                vms, f"/rsapi/searchevents?lastminutes={minutes}&levels=0,1,2", timeout=60.0
            )
            if not xml_data:
                continue
            events = parse_events_xml(xml_data)
            for ev in events:
                ev_id = ev.get("id")
                if not ev_id:
                    continue
                if disabled_types and ev.get("type", "") in disabled_types:
                    continue
                exists = await db.vms_event_store.find_one({"event_id": ev_id}, {"_id": 1})
                if exists:
                    total_dup += 1
                    continue
                time_raw = ev.get("time", "")
                try:
                    dt = datetime.fromisoformat(time_raw.replace("Z", "+00:00"))
                    if dt.tzinfo is None:
                        dt = dt.replace(tzinfo=timezone.utc)
                except (ValueError, AttributeError):
                    dt = datetime.now(timezone.utc)
                doc = {
                    "event_id":    ev_id,
                    "vms_id":      vms.get("id", ""),
                    "vms_name":    vms.get("name", ""),
                    "type":        ev.get("type", ""),
                    "type_desc":   ev.get("type_desc", ""),
                    "level":       ev.get("level", "0"),
                    "time":        dt,
                    "camera_id":   ev.get("camera_id", ""),
                    "camera_name": ev.get("camera_name", ""),
                    "short_desc":  ev.get("short_desc", ""),
                    "plate":       ev.get("plate", ""),
                    "direction":   ev.get("direction", ""),
                    "passage":     ev.get("passage", ""),
                    "collected_at": datetime.now(timezone.utc),
                }
                await db.vms_event_store.insert_one(doc)
                total_new += 1
        logger.info(f"Manual collection ({minutes}dk): +{total_new} new, {total_dup} dup skipped")
    except Exception as e:
        logger.error(f"_collect_with_minutes error: {e}")


@router.get("/alarms")
async def get_alarm_stats(
    time_from:  Optional[str] = Query(None),
    time_to:    Optional[str] = Query(None),
    levels:     Optional[str] = Query(None, description="Virgülle: 0=Bildirim,1=Alarm,2=Hata"),
    camera_id:  Optional[str] = Query(None),
    types:      Optional[str] = Query(None, description="Virgülle ayrılmış olay tipleri: LPR,NNEvent,..."),
    user: dict = Depends(require_auth),
):
    """Alarm istatistikleri — dashboard ve raporlar için."""
    match = _time_filter(time_from, time_to)

    if levels:
        level_list = [l.strip() for l in levels.split(",")]
        match["level"] = {"$in": level_list}
    if camera_id:
        match["camera_id"] = camera_id
    if types:
        type_list = [t.strip() for t in types.split(",") if t.strip()]
        if type_list:
            match["type"] = {"$in": type_list}

    # LPR araç geçişleri alarm değil — varsayılan olarak hariç tut
    # (types parametresi ile override edilebilir)
    if not types:
        match["type"] = {"$ne": "LPR"}
    elif "LPR" in [t.strip() for t in types.split(",")]:
        pass  # LPR açıkça istenmiş, filtre uygulanmaz

    events = await db.vms_event_store.find(match, {"_id": 0}).sort("time", -1).to_list(10000)

    by_level   = defaultdict(int)
    by_camera  = defaultdict(int)
    by_type    = defaultdict(int)
    by_hour    = defaultdict(int)

    for ev in events:
        lbl = LEVEL_LABEL.get(str(ev.get("level", "")), "Diğer")
        by_level[lbl] += 1
        cam = ev.get("camera_name") or ev.get("camera_id") or "Bilinmiyor"
        by_camera[cam] += 1
        by_type[ev.get("type") or "Diğer"] += 1
        h = _extract_hour(ev.get("time"))
        if h is not None:
            by_hour[h] += 1

    # Son 100 event listesi (dashboard ve rapor tablosu)
    serialized = []
    for ev in events[:100]:
        e = dict(ev)
        if isinstance(e.get("time"), datetime):
            e["time"] = e["time"].isoformat()
        e.pop("collected_at", None)
        serialized.append(e)

    counts = {v: by_level.get(v, 0) for v in ("Bildirim", "Alarm", "Hata")}

    return {
        "total":  len(events),
        "counts": counts,
        "events": serialized,
        "stats": {
            "by_level":  dict(by_level),
            "by_camera": dict(sorted(by_camera.items(), key=lambda x: -x[1])[:20]),
            "by_type":   dict(sorted(by_type.items(),   key=lambda x: -x[1])[:20]),
            "by_hour":   {str(h): v for h, v in sorted(by_hour.items())},
        },
    }


@router.get("/lpr/by-camera")
async def get_lpr_by_camera(
    time_from: Optional[str] = Query(None),
    time_to:   Optional[str] = Query(None),
    user: dict = Depends(require_auth),
):
    """Kamera bazlı LPR giriş/çıkış istatistikleri (MongoDB aggregation)."""
    match = _time_filter(time_from, time_to)
    match["type"] = "LPR"

    pipeline = [
        {"$match": match},
        {"$group": {
            "_id": {
                "camera_id":   "$camera_id",
                "camera_name": "$camera_name",
            },
            "total": {"$sum": 1},
            "entry": {"$sum": {"$cond": [{"$eq": ["$direction", "BottomUp"]}, 1, 0]}},
            "exit":  {"$sum": {"$cond": [
                {"$or": [
                    {"$eq": ["$direction", "TopDown"]},
                    {"$eq": ["$passage",   "Exit"]},
                ]},
                1, 0
            ]}},
        }},
        {"$project": {
            "_id":         0,
            "camera_id":   "$_id.camera_id",
            "camera_name": "$_id.camera_name",
            "total": 1,
            "entry": 1,
            "exit":  1,
            "unknown": {"$subtract": ["$total", {"$add": ["$entry", "$exit"]}]},
        }},
        {"$sort": {"total": -1}},
    ]

    cameras = await db.vms_event_store.aggregate(pipeline).to_list(100)
    return {"cameras": cameras}


@router.get("/lpr")
async def get_lpr_stats(
    time_from: Optional[str] = Query(None),
    time_to:   Optional[str] = Query(None),
    camera_id: Optional[str] = Query(None),
    user: dict = Depends(require_auth),
):
    """LPR (plaka) istatistikleri."""
    match = _time_filter(time_from, time_to)
    match["type"] = "LPR"
    if camera_id:
        match["camera_id"] = camera_id

    events = await db.vms_event_store.find(match, {"_id": 0}).sort("time", -1).to_list(10000)

    plates    = defaultdict(int)
    by_camera = defaultdict(int)
    by_hour   = defaultdict(int)

    for ev in events:
        plate = ev.get("plate") or ""
        if plate:
            plates[plate] += 1
        cam = ev.get("camera_name") or ev.get("camera_id") or "Bilinmiyor"
        by_camera[cam] += 1
        h = _extract_hour(ev.get("time"))
        if h is not None:
            by_hour[h] += 1

    top_plates = sorted(plates.items(), key=lambda x: -x[1])[:20]

    serialized = []
    for ev in events[:500]:
        e = dict(ev)
        if isinstance(e.get("time"), datetime):
            e["time"] = e["time"].isoformat()
        e.pop("collected_at", None)
        serialized.append(e)

    return {
        "total":         len(events),
        "unique_plates": len(plates),
        "events":        serialized,
        "stats": {
            "by_camera":  dict(sorted(by_camera.items(), key=lambda x: -x[1])[:10]),
            "by_hour":    {str(h): v for h, v in sorted(by_hour.items())},
            "top_plates": [{"plate": p, "count": c} for p, c in top_plates],
        },
    }
