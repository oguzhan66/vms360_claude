"""
VMS360 Alerts Router
GET  /alerts          — list alerts (filterable)
GET  /alerts/stats    — summary stats + hourly + daily breakdown
GET  /alerts/export   — CSV download
POST /alerts/send-report — e-mail report
"""
from fastapi import APIRouter, Query, HTTPException, Depends
from fastapi.responses import StreamingResponse
from typing import Optional
from datetime import datetime, timezone
from database import db
from auth import require_auth
from permissions import get_user_allowed_stores
import io, csv, smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

router = APIRouter(prefix="/alerts", tags=["alerts"])


def _parse_dt(s: str) -> datetime:
    try:
        return datetime.fromisoformat(s).replace(tzinfo=timezone.utc)
    except Exception:
        return datetime.now(timezone.utc)


def _alert_out(a: dict) -> dict:
    a.pop("_id", None)
    return a


@router.get("")
async def list_alerts(
    date_from: Optional[str] = None,
    date_to:   Optional[str] = None,
    alert_type: Optional[str] = None,
    level:      Optional[str] = None,
    store_id:   Optional[str] = None,
    status:     Optional[str] = None,
    limit: int = Query(200, le=1000),
    user: dict = Depends(require_auth),
):
    allowed_stores = await get_user_allowed_stores(user)
    filt: dict = {}

    # Tenant isolation via allowed store IDs
    if store_id:
        if allowed_stores is not None and store_id not in allowed_stores:
            return {"alerts": [], "total": 0}
        filt["store_id"] = store_id
    elif allowed_stores is not None:
        if not allowed_stores:
            return {"alerts": [], "total": 0}
        filt["store_id"] = {"$in": list(allowed_stores)}

    if date_from or date_to:
        date_filt: dict = {}
        if date_from:
            date_filt["$gte"] = date_from[:10]
        if date_to:
            date_filt["$lte"] = date_to[:10]
        filt["date"] = date_filt

    if alert_type in ("counter", "queue"):
        filt["alert_type"] = alert_type
    if level in ("critical", "warning"):
        filt["level"] = level
    if status == "active":
        filt["cleared_at"] = None
    elif status == "cleared":
        filt["cleared_at"] = {"$ne": None}

    docs = await db.alerts.find(filt, {"_id": 0}).sort("started_at", -1).limit(limit).to_list(limit)
    return {"alerts": docs, "total": len(docs)}


@router.get("/stats")
async def alert_stats(
    date_from:  Optional[str] = None,
    date_to:    Optional[str] = None,
    alert_type: Optional[str] = None,
    store_id:   Optional[str] = None,
    user: dict = Depends(require_auth),
):
    allowed_stores = await get_user_allowed_stores(user)
    filt: dict = {}

    if store_id:
        if allowed_stores is not None and store_id not in allowed_stores:
            filt["store_id"] = store_id  # will return empty
        else:
            filt["store_id"] = store_id
    elif allowed_stores is not None:
        if not allowed_stores:
            filt["store_id"] = {"$in": []}
        else:
            filt["store_id"] = {"$in": list(allowed_stores)}

    if date_from or date_to:
        df: dict = {}
        if date_from:
            df["$gte"] = date_from[:10]
        if date_to:
            df["$lte"] = date_to[:10]
        filt["date"] = df
    if alert_type in ("counter", "queue"):
        filt["alert_type"] = alert_type

    docs = await db.alerts.find(filt, {"_id": 0}).to_list(5000)
    total = len(docs)

    # By level
    critical = sum(1 for d in docs if d.get("level") == "critical")
    warning  = sum(1 for d in docs if d.get("level") == "warning")
    active   = sum(1 for d in docs if not d.get("cleared_at"))

    # Avg duration (closed only)
    durations = [d["duration_minutes"] for d in docs if d.get("duration_minutes") and d.get("cleared_at")]
    avg_duration = round(sum(durations) / len(durations)) if durations else 0

    # Hourly distribution
    hourly: dict = {}
    for d in docs:
        h = d.get("hour", 0)
        lv = d.get("level", "warning")
        key = (h, lv)
        hourly[key] = hourly.get(key, 0) + 1
    hourly_list = [{"hour": h, "level": lv, "count": cnt} for (h, lv), cnt in sorted(hourly.items())]

    # Daily summary
    daily: dict = {}
    for d in docs:
        dt = d.get("date", "")[:10]
        if dt not in daily:
            daily[dt] = {"date": dt, "critical": 0, "warning": 0, "total": 0}
        daily[dt][d.get("level", "warning")] += 1
        daily[dt]["total"] += 1
    daily_list = sorted(daily.values(), key=lambda x: x["date"])

    # Per store
    by_store: dict = {}
    for d in docs:
        sid = d.get("store_id", "")
        sn  = d.get("store_name", sid)
        if sid not in by_store:
            by_store[sid] = {"store_id": sid, "store_name": sn, "critical": 0, "warning": 0, "total": 0}
        by_store[sid][d.get("level", "warning")] += 1
        by_store[sid]["total"] += 1
    store_list = sorted(by_store.values(), key=lambda x: -x["total"])

    return {
        "total_alerts": total,
        "critical": critical,
        "warning": warning,
        "active": active,
        "avg_duration_minutes": avg_duration,
        "hourly_distribution": hourly_list,
        "daily_summary": daily_list,
        "by_store": store_list,
    }


@router.get("/export")
async def export_alerts_csv(
    date_from:  Optional[str] = None,
    date_to:    Optional[str] = None,
    alert_type: Optional[str] = None,
    level:      Optional[str] = None,
    store_id:   Optional[str] = None,
):
    filt: dict = {}
    if date_from or date_to:
        df: dict = {}
        if date_from: df["$gte"] = date_from[:10]
        if date_to:   df["$lte"] = date_to[:10]
        filt["date"] = df
    if alert_type in ("counter", "queue"):
        filt["alert_type"] = alert_type
    if level in ("critical", "warning"):
        filt["level"] = level
    if store_id:
        filt["store_id"] = store_id

    docs = await db.alerts.find(filt, {"_id": 0}).sort("started_at", -1).to_list(5000)

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["Lokasyon", "Tür", "Seviye", "Başlangıç", "Bitiş", "Süre (dk)", "Max Değer", "Eşik", "Durum"])
    type_tr  = {"counter": "Kişi Sayma", "queue": "Kuyruk"}
    level_tr = {"critical": "Kritik", "warning": "Uyarı"}
    for d in docs:
        writer.writerow([
            d.get("store_name", ""),
            type_tr.get(d.get("alert_type", ""), d.get("alert_type", "")),
            level_tr.get(d.get("level", ""), d.get("level", "")),
            (d.get("started_at") or "")[:19].replace("T", " "),
            (d.get("cleared_at") or "—")[:19].replace("T", " "),
            d.get("duration_minutes", "—"),
            d.get("peak_value", "—"),
            d.get("threshold") or d.get("threshold_percent") or "—",
            "Aktif" if not d.get("cleared_at") else "Kapandı",
        ])

    fname = f"uyari_raporu_{(date_from or '')[:10]}_{(date_to or '')[:10]}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv; charset=utf-8-sig",
        headers={"Content-Disposition": f"attachment; filename={fname}"},
    )


@router.post("/send-report")
async def send_alert_report(body: dict):
    date_from  = body.get("date_from", "")
    date_to    = body.get("date_to", "")
    alert_type = body.get("alert_type")
    recipient  = body.get("recipient", "")

    filt: dict = {}
    if date_from or date_to:
        df: dict = {}
        if date_from: df["$gte"] = date_from[:10]
        if date_to:   df["$lte"] = date_to[:10]
        filt["date"] = df
    if alert_type in ("counter", "queue"):
        filt["alert_type"] = alert_type

    docs = await db.alerts.find(filt, {"_id": 0}).sort("started_at", -1).to_list(1000)
    total    = len(docs)
    critical = sum(1 for d in docs if d.get("level") == "critical")
    warning  = sum(1 for d in docs if d.get("level") == "warning")
    active   = sum(1 for d in docs if not d.get("cleared_at"))

    # Build HTML table (top 30)
    type_tr  = {"counter": "Kişi Sayma", "queue": "Kuyruk"}
    level_tr = {"critical": "🔴 Kritik", "warning": "🟡 Uyarı"}
    rows = ""
    for d in docs[:30]:
        bg = "#fff0f0" if d.get("level") == "critical" else "#fffbea"
        rows += (
            f"<tr style='background:{bg}'>"
            f"<td>{d.get('store_name','')}</td>"
            f"<td>{type_tr.get(d.get('alert_type',''),d.get('alert_type',''))}</td>"
            f"<td>{level_tr.get(d.get('level',''),d.get('level',''))}</td>"
            f"<td>{(d.get('started_at') or '')[:16].replace('T',' ')}</td>"
            f"<td>{d.get('duration_minutes','—')} dk</td>"
            f"<td>{'Aktif' if not d.get('cleared_at') else 'Kapandı'}</td>"
            f"</tr>"
        )

    html = f"""
    <html><body style="font-family:Arial,sans-serif;color:#333">
    <h2 style="color:#c53030">VMS360 Uyarı Raporu</h2>
    <p>{date_from[:10] if date_from else '—'} → {date_to[:10] if date_to else '—'}</p>
    <table style="border-collapse:collapse;width:100%;font-size:13px">
      <tr style="background:#2d3748;color:#fff">
        <td style="padding:6px 10px">Toplam</td>
        <td style="padding:6px 10px">Kritik</td>
        <td style="padding:6px 10px">Uyarı</td>
        <td style="padding:6px 10px">Aktif</td>
      </tr>
      <tr style="font-size:20px;font-weight:bold;text-align:center">
        <td style="padding:8px 10px">{total}</td>
        <td style="padding:8px 10px;color:#c53030">{critical}</td>
        <td style="padding:8px 10px;color:#d69e2e">{warning}</td>
        <td style="padding:8px 10px;color:#e53e3e">{active}</td>
      </tr>
    </table>
    <br>
    <table style="border-collapse:collapse;width:100%;font-size:12px">
      <tr style="background:#4a5568;color:#fff">
        <th style="padding:5px 8px;text-align:left">Mağaza</th>
        <th style="padding:5px 8px;text-align:left">Tür</th>
        <th style="padding:5px 8px;text-align:left">Seviye</th>
        <th style="padding:5px 8px;text-align:left">Başlangıç</th>
        <th style="padding:5px 8px;text-align:left">Süre</th>
        <th style="padding:5px 8px;text-align:left">Durum</th>
      </tr>
      {rows}
    </table>
    {'<p style="color:#888;font-size:11px">İlk 30 kayıt gösterilmektedir.</p>' if total > 30 else ''}
    </body></html>
    """

    try:
        smtp_cfg = await db.smtp_settings.find_one({}, {"_id": 0})
        if not smtp_cfg or not smtp_cfg.get("host"):
            return {"success": False, "message": "SMTP ayarları yapılandırılmamış"}

        to_addr = recipient or smtp_cfg.get("default_recipient") or smtp_cfg.get("username", "")
        if not to_addr:
            return {"success": False, "message": "Alıcı e-posta adresi bulunamadı"}

        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"VMS360 Uyarı Raporu — {date_from[:10] if date_from else '?'} / {date_to[:10] if date_to else '?'}"
        msg["From"]    = smtp_cfg.get("username", "vms360@noreply")
        msg["To"]      = to_addr
        msg.attach(MIMEText(html, "html", "utf-8"))

        with smtplib.SMTP(smtp_cfg["host"], int(smtp_cfg.get("port", 587))) as s:
            if smtp_cfg.get("use_tls", True):
                s.starttls()
            if smtp_cfg.get("username") and smtp_cfg.get("password"):
                s.login(smtp_cfg["username"], smtp_cfg["password"])
            s.send_message(msg)

        return {"success": True, "message": f"{to_addr} adresine gönderildi ({total} uyarı)"}
    except Exception as e:
        return {"success": False, "message": str(e)}
