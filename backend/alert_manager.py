"""
VMS360 Alert Manager
Kişi sayma (doluluk) ve kuyruk yoğunluğu için uyarı takibi.
Her 5 dakikalık snapshot'ta önceki durum ile karşılaştırır,
uyarı başlayınca açar, bitince kapatır.
"""
import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timezone
from typing import Optional
from database import db

logger = logging.getLogger(__name__)


async def process_counter_alert(store_id: str, store_name: str, status: str,
                                 occupancy_percent: float, current_visitors: int,
                                 capacity: int, timestamp: datetime):
    """Kişi sayma snapshot'ından alert üret/kapat."""
    try:
        active = await db.alerts.find_one(
            {"store_id": store_id, "alert_type": "counter", "cleared_at": None}
        )

        if status in ("warning", "critical"):
            if not active:
                # Yeni uyarı aç
                alert = {
                    "store_id": store_id,
                    "store_name": store_name,
                    "alert_type": "counter",
                    "level": status,
                    "started_at": timestamp.isoformat(),
                    "cleared_at": None,
                    "date": timestamp.strftime("%Y-%m-%d"),
                    "hour": timestamp.hour,
                    "peak_value": occupancy_percent,
                    "peak_visitors": current_visitors,
                    "capacity": capacity,
                    "threshold_percent": 90 if status == "critical" else 70,
                    "email_sent": False,
                }
                await db.alerts.insert_one(alert)
                logger.info(f"[ALERT] Kişi sayma uyarısı açıldı: {store_name} %{occupancy_percent}")
                await maybe_send_alert_email(alert)
            else:
                # Peak değeri güncelle
                if occupancy_percent > active.get("peak_value", 0):
                    await db.alerts.update_one(
                        {"_id": active["_id"]},
                        {"$set": {"peak_value": occupancy_percent,
                                  "peak_visitors": current_visitors,
                                  "level": status}}
                    )
        else:
            if active:
                # Uyarıyı kapat
                duration = int((timestamp - datetime.fromisoformat(
                    active["started_at"].replace("Z", "+00:00")
                    if active["started_at"].endswith("Z")
                    else active["started_at"]
                )).total_seconds() / 60)
                await db.alerts.update_one(
                    {"_id": active["_id"]},
                    {"$set": {"cleared_at": timestamp.isoformat(),
                               "duration_minutes": duration}}
                )
                logger.info(f"[ALERT] Kişi sayma uyarısı kapandı: {store_name} ({duration} dk)")
    except Exception as e:
        logger.error(f"Counter alert error for {store_name}: {e}")


async def process_queue_alert(store_id: str, store_name: str, status: str,
                               total_queue: int, threshold: int, timestamp: datetime):
    """Kuyruk snapshot'ından alert üret/kapat."""
    try:
        active = await db.alerts.find_one(
            {"store_id": store_id, "alert_type": "queue", "cleared_at": None}
        )

        if status in ("warning", "critical"):
            if not active:
                alert = {
                    "store_id": store_id,
                    "store_name": store_name,
                    "alert_type": "queue",
                    "level": status,
                    "started_at": timestamp.isoformat(),
                    "cleared_at": None,
                    "date": timestamp.strftime("%Y-%m-%d"),
                    "hour": timestamp.hour,
                    "peak_value": total_queue,
                    "threshold": threshold,
                    "email_sent": False,
                }
                await db.alerts.insert_one(alert)
                logger.info(f"[ALERT] Kuyruk uyarısı açıldı: {store_name} {total_queue} kişi")
                await maybe_send_alert_email(alert)
            else:
                if total_queue > active.get("peak_value", 0):
                    await db.alerts.update_one(
                        {"_id": active["_id"]},
                        {"$set": {"peak_value": total_queue, "level": status}}
                    )
        else:
            if active:
                duration = int((timestamp - datetime.fromisoformat(
                    active["started_at"].replace("Z", "+00:00")
                    if active["started_at"].endswith("Z")
                    else active["started_at"]
                )).total_seconds() / 60)
                await db.alerts.update_one(
                    {"_id": active["_id"]},
                    {"$set": {"cleared_at": timestamp.isoformat(),
                               "duration_minutes": duration}}
                )
                logger.info(f"[ALERT] Kuyruk uyarısı kapandı: {store_name} ({duration} dk)")
    except Exception as e:
        logger.error(f"Queue alert error for {store_name}: {e}")


async def maybe_send_alert_email(alert: dict):
    """Yeni uyarı için e-posta gönder (ayarlar aktifse)."""
    try:
        alert_settings = await db.alert_settings.find_one({}, {"_id": 0})
        if not alert_settings or not alert_settings.get("enabled"):
            return
        emails = alert_settings.get("alert_emails", [])
        if not emails:
            return

        smtp = await db.smtp_settings.find_one({}, {"_id": 0})
        if not smtp or not smtp.get("host"):
            return

        alert_type_tr = "Kişi Sayma" if alert["alert_type"] == "counter" else "Kuyruk"
        level_tr = "Kritik 🔴" if alert["level"] == "critical" else "Uyarı 🟡"

        if alert["alert_type"] == "counter":
            detail = f"Doluluk: %{alert.get('peak_value', 0)} (Eşik: %{alert.get('threshold_percent', 70)})"
        else:
            detail = f"Kuyruk: {alert.get('peak_value', 0)} kişi (Eşik: {alert.get('threshold', 5)})"

        subject = f"VMS360 {level_tr} | {alert_type_tr} | {alert['store_name']}"
        body = f"""
        <html><body style="font-family:Arial,sans-serif;padding:20px;">
        <div style="background:#1a1a2e;color:white;padding:15px;border-radius:8px;margin-bottom:20px;">
            <h2 style="margin:0;">VMS360 Uyarı Bildirimi</h2>
        </div>
        <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Mağaza</td>
                <td style="padding:8px;border:1px solid #ddd;">{alert['store_name']}</td></tr>
            <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Uyarı Türü</td>
                <td style="padding:8px;border:1px solid #ddd;">{alert_type_tr}</td></tr>
            <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Seviye</td>
                <td style="padding:8px;border:1px solid #ddd;">{level_tr}</td></tr>
            <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Detay</td>
                <td style="padding:8px;border:1px solid #ddd;">{detail}</td></tr>
            <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Başlangıç</td>
                <td style="padding:8px;border:1px solid #ddd;">{alert['started_at'][:19].replace('T',' ')}</td></tr>
        </table>
        <p style="color:#888;font-size:12px;margin-top:20px;">VMS360 Retail Panel tarafından gönderilmiştir.</p>
        </body></html>
        """

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{smtp.get('from_name','VMS360')} <{smtp['from_email']}>"
        msg["To"] = ", ".join(emails)
        msg.attach(MIMEText(body, "html", "utf-8"))

        if smtp.get("use_tls", True):
            server = smtplib.SMTP(smtp["host"], smtp["port"], timeout=30)
            server.starttls()
        else:
            server = smtplib.SMTP_SSL(smtp["host"], smtp["port"], timeout=30)

        if smtp.get("username"):
            server.login(smtp["username"], smtp["password"])

        server.sendmail(msg["From"], emails, msg.as_string())
        server.quit()

        await db.alerts.update_one(
            {"store_id": alert["store_id"], "started_at": alert["started_at"]},
            {"$set": {"email_sent": True}}
        )
        logger.info(f"Alert email sent for {alert['store_name']}")
    except Exception as e:
        logger.error(f"Alert email error: {e}")
