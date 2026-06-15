"""VMS360-Stats – Sagitech VMS Alarm & LPR Event Statistics"""
from fastapi import APIRouter, Depends, Query, HTTPException
from typing import Optional
from collections import defaultdict
import xml.etree.ElementTree as ET
import logging

from database import db
from vms_utils import fetch_vms_data
from auth import require_auth

router = APIRouter(prefix="/vms-events", tags=["VMS Events"])
logger = logging.getLogger(__name__)


# ── XML parsers ──────────────────────────────────────────────────────────────

def parse_events_xml(xml_data: str) -> list:
    """Parse /rsapi/searchevents XML — returns list of event dicts.

    Actual Sagitech format:
      <Level>Notification | Alarm | Error | Fault</Level>  (string, not numeric)
      <Type>LPR | NNEvent | Motion | ...</Type>
      <ShortDescription>PLATE_NO</ShortDescription>        (for LPR events)
      <CsvDescription>Plate=34ABC12;Direction=...;Passage=...;...</CsvDescription>
    """
    # Sagitech string → numeric level mapping
    STR_LEVEL = {
        "notification": "0",
        "alarm":        "1",
        "error":        "2",
        "fault":        "2",
        "warning":      "1",
    }

    try:
        root = ET.fromstring(xml_data)
        events = []
        for ev in root.findall(".//EventInfo"):
            ev_type   = ev.findtext("Type") or ""
            csv_desc  = ev.findtext("CsvDescription") or ""
            short_desc = ev.findtext("ShortDescription") or ""

            # Level: convert string to numeric
            level_raw = (ev.findtext("Level") or "").strip()
            level = STR_LEVEL.get(level_raw.lower(), level_raw)

            # Extract plate:
            # For LPR events ShortDescription IS the plate number
            # Also try Plate= key in CsvDescription
            plate = ""
            if ev_type.upper() == "LPR":
                plate = short_desc.strip()
            if not plate and csv_desc:
                for part in csv_desc.split(";"):
                    part = part.strip()
                    if part.upper().startswith("PLATE="):
                        plate = part.split("=", 1)[1].strip()
                        break

            # Parse CsvDescription into a dict for convenience
            csv_dict = {}
            for part in csv_desc.split(";"):
                if "=" in part:
                    k, v = part.split("=", 1)
                    csv_dict[k.strip()] = v.strip()

            events.append({
                "id":          ev.findtext("ID") or "",
                "type":        ev_type,
                "type_desc":   ev.findtext("TypeDescription") or "",
                "level":       level,
                "time":        ev.findtext("Time") or "",
                "camera_id":   ev.findtext("CameraID") or "",
                "camera_name": ev.findtext("CameraName") or "",
                "short_desc":  short_desc,
                "long_desc":   ev.findtext("LongDescription") or "",
                "csv_desc":    csv_desc,
                "plate":       plate,
                "direction":   csv_dict.get("Direction", ""),
                "passage":     csv_dict.get("Passage", ""),
            })
        return events
    except ET.ParseError as e:
        logger.error(f"Events XML parse error: {e}")
        return []


def parse_lpr_parking_xml(xml_data: str) -> dict:
    """Parse /rsapi/modules/lpr/parkinginfo XML."""
    try:
        root = ET.fromstring(xml_data)
        size = int(root.findtext("ParkingSize") or "0")
        vehicles = []
        for info in root.findall(".//LPRInsideInfo"):
            vehicles.append({
                "plate":         info.findtext("Plate") or "",
                "entrance_time": info.findtext("EntranceTime") or "",
                "camera_id":     info.findtext("CameraID") or "",
            })
        count = len(vehicles)
        return {
            "parking_size":      size,
            "current_count":     count,
            "occupancy_percent": round(count / size * 100, 1) if size > 0 else 0,
            "vehicles":          vehicles,
        }
    except ET.ParseError as e:
        logger.error(f"LPR parking XML parse error: {e}")
        return {"parking_size": 0, "current_count": 0, "occupancy_percent": 0, "vehicles": []}


# ── helpers ───────────────────────────────────────────────────────────────────

async def _get_servers(vms_id: Optional[str]) -> list:
    if vms_id:
        return await db.vms_servers.find({"id": vms_id}, {"_id": 0}).to_list(1)
    return await db.vms_servers.find({"is_active": True}, {"_id": 0}).to_list(100)


def _extract_hour(time_str: str) -> Optional[int]:
    if "T" in time_str:
        try:
            return int(time_str.split("T")[1][:2])
        except (ValueError, IndexError):
            pass
    return None


def _build_alarm_stats(events: list) -> dict:
    level_map = {"0": "Bildirim", "1": "Alarm", "2": "Hata"}
    by_level  = defaultdict(int)
    by_camera = defaultdict(int)
    by_type   = defaultdict(int)
    by_hour   = defaultdict(int)

    for e in events:
        lbl = level_map.get(str(e.get("level", "")), e.get("level") or "Diğer")
        by_level[lbl] += 1
        cam = e.get("camera_name") or e.get("camera_id") or "Bilinmiyor"
        by_camera[cam] += 1
        by_type[e.get("type") or "Bilinmiyor"] += 1
        h = _extract_hour(e.get("time", ""))
        if h is not None:
            by_hour[h] += 1

    return {
        "by_level":  dict(by_level),
        "by_camera": dict(sorted(by_camera.items(), key=lambda x: -x[1])[:15]),
        "by_type":   dict(sorted(by_type.items(),   key=lambda x: -x[1])[:15]),
        "by_hour":   {str(h): v for h, v in sorted(by_hour.items())},
    }


# ── routes ────────────────────────────────────────────────────────────────────

@router.get("/servers")
async def list_vms_servers(user: dict = Depends(require_auth)):
    """List active VMS servers."""
    servers = await db.vms_servers.find({"is_active": True}, {"_id": 0}).to_list(100)
    return [{"id": s["id"], "name": s["name"]} for s in servers]


@router.get("/alarms")
async def get_alarm_events(
    vms_id:       Optional[str] = Query(None, description="Belirli VMS ID (boş=tümü)"),
    last_minutes: Optional[int] = Query(None, description="Son N dakika"),
    time_from:    Optional[str] = Query(None, description="2024-01-24T00:00:00"),
    time_to:      Optional[str] = Query(None),
    levels:       str           = Query("0,1", description="Virgülle: 0=Bildirim,1=Alarm"),
    camera_ids:   Optional[str] = Query(None, description="Virgülle ayrılmış kamera ID"),
    user: dict = Depends(require_auth),
):
    """Fetch alarm events from Sagitech VMS /rsapi/searchevents."""
    servers = await _get_servers(vms_id)
    if not servers:
        raise HTTPException(404, "Aktif VMS sunucusu bulunamadı")

    all_events = []
    for vms in servers:
        params = []
        if last_minutes:
            params.append(f"lastminutes={last_minutes}")
        else:
            if time_from: params.append(f"timeFrom={time_from}")
            if time_to:   params.append(f"timeTo={time_to}")
        params.append(f"levels={levels}")
        if camera_ids:    params.append(f"cameraids={camera_ids}")

        endpoint = "/rsapi/searchevents?" + "&".join(params)
        xml_data = await fetch_vms_data(vms, endpoint, timeout=20.0)
        if xml_data:
            evs = parse_events_xml(xml_data)
            for e in evs:
                e["vms_name"] = vms.get("name", "")
            all_events.extend(evs)

    level_map = {"0": "Bildirim", "1": "Alarm", "2": "Hata"}
    counts = {v: 0 for v in level_map.values()}
    for e in all_events:
        lbl = level_map.get(str(e.get("level", "")), "Diğer")
        counts[lbl] = counts.get(lbl, 0) + 1

    return {
        "total":  len(all_events),
        "counts": counts,
        "events": all_events,
        "stats":  _build_alarm_stats(all_events),
    }


@router.get("/lpr")
async def get_lpr_events(
    vms_id:       Optional[str] = Query(None),
    last_minutes: Optional[int] = Query(None),
    time_from:    Optional[str] = Query(None),
    time_to:      Optional[str] = Query(None),
    camera_ids:   Optional[str] = Query(None),
    user: dict = Depends(require_auth),
):
    """Fetch LPR/plate recognition events from Sagitech VMS."""
    servers = await _get_servers(vms_id)
    if not servers:
        raise HTTPException(404, "Aktif VMS sunucusu bulunamadı")

    all_events = []
    for vms in servers:
        params = []
        if last_minutes:
            params.append(f"lastminutes={last_minutes}")
        else:
            if time_from: params.append(f"timeFrom={time_from}")
            if time_to:   params.append(f"timeTo={time_to}")
        if camera_ids:    params.append(f"cameraids={camera_ids}")

        # Use levels=0,1 to get all events, then filter LPR ones
        params.append("levels=0,1")
        endpoint = "/rsapi/searchevents?" + "&".join(params)
        xml_data = await fetch_vms_data(vms, endpoint, timeout=20.0)
        if xml_data:
            evs = parse_events_xml(xml_data)
            # Filter LPR: event type contains lpr/plate OR csv has plate-like value
            lpr_evs = [
                e for e in evs
                if ("lpr" in (e.get("type") or "").lower()
                    or "plate" in (e.get("type") or "").lower()
                    or "plak" in (e.get("short_desc") or "").lower()
                    or bool(e.get("plate")))
            ]
            for e in lpr_evs:
                e["vms_name"] = vms.get("name", "")
            all_events.extend(lpr_evs)

    plates    = defaultdict(int)
    by_camera = defaultdict(int)
    by_hour   = defaultdict(int)

    for e in all_events:
        plate = e.get("plate") or ""
        if plate:
            plates[plate] += 1
        cam = e.get("camera_name") or e.get("camera_id") or "Bilinmiyor"
        by_camera[cam] += 1
        h = _extract_hour(e.get("time", ""))
        if h is not None:
            by_hour[h] += 1

    top_plates = sorted(plates.items(), key=lambda x: -x[1])[:20]

    return {
        "total":         len(all_events),
        "unique_plates": len(plates),
        "events":        all_events,
        "stats": {
            "by_camera":  dict(sorted(by_camera.items(), key=lambda x: -x[1])[:10]),
            "by_hour":    {str(h): v for h, v in sorted(by_hour.items())},
            "top_plates": [{"plate": p, "count": c} for p, c in top_plates],
        },
    }


@router.get("/lpr/parking")
async def get_lpr_parking(
    vms_id: Optional[str] = Query(None),
    user: dict = Depends(require_auth),
):
    """Get current parking occupancy from LPR module."""
    servers = await _get_servers(vms_id)
    if not servers:
        raise HTTPException(404, "Aktif VMS sunucusu bulunamadı")

    results = []
    for vms in servers:
        xml_data = await fetch_vms_data(vms, "/rsapi/modules/lpr/parkinginfo", timeout=10.0)
        if xml_data:
            data = parse_lpr_parking_xml(xml_data)
            data["vms_name"] = vms.get("name", "")
            results.append(data)

    total_cap     = sum(r["parking_size"]  for r in results)
    total_current = sum(r["current_count"] for r in results)

    return {
        "total_capacity": total_cap,
        "total_current":  total_current,
        "total_occupancy_percent": round(total_current / total_cap * 100, 1) if total_cap else 0,
        "by_vms": results,
    }
