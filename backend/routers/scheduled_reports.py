"""Scheduled Reports Router"""
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from typing import Optional, List
from datetime import datetime, timezone
from pydantic import BaseModel, Field
from io import BytesIO
import json
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email.mime.text import MIMEText
from email import encoders
import logging

from database import db
from auth import require_auth, require_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/scheduled-reports", tags=["Scheduled Reports"])


# ============== MODELS ==============

class ScheduledReportCreate(BaseModel):
    name: str
    report_type: str
    format: str = "excel"
    frequency: str = "daily"
    send_time: str = "08:00"
    send_day: Optional[int] = None
    recipients: List[str]


class ScheduledReportUpdate(BaseModel):
    name: Optional[str] = None
    report_type: Optional[str] = None
    format: Optional[str] = None
    frequency: Optional[str] = None
    send_time: Optional[str] = None
    send_day: Optional[int] = None
    recipients: Optional[List[str]] = None
    is_active: Optional[bool] = None


# ============== HELPER FUNCTIONS ==============

async def generate_report_data(report_type: str):
    """Generate report data based on type"""
    from data_collector import get_all_stores_daily_data, get_latest_snapshots
    
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    daily_data = await get_all_stores_daily_data(today)
    
    if report_type == "hourly_traffic":
        # Get hourly aggregates
        hourly_data = await db.hourly_aggregates.find({"date": today}, {"_id": 0}).to_list(100)
        hours = list(range(8, 23))
        
        result_data = []
        for hour in hours:
            total_in = 0
            for store_hourly in hourly_data:
                for h in store_hourly.get("hourly_data", []):
                    if h.get("hour") == hour:
                        total_in += h.get("in_count", 0)
            result_data.append({
                "hour": f"{hour:02d}:00", 
                "visitors": total_in, 
                "is_peak": hour in [11, 12, 13, 17, 18, 19]
            })
        return {"type": "Saatlik Trafik", "data": result_data}
    
    elif report_type == "weekday_comparison":
        # Get last 7 days
        from datetime import timedelta
        daily_totals = {}
        for i in range(7):
            date = (datetime.now(timezone.utc) - timedelta(days=i)).strftime("%Y-%m-%d")
            day_name = (datetime.now(timezone.utc) - timedelta(days=i)).strftime("%A")
            data = await get_all_stores_daily_data(date)
            daily_totals[day_name] = sum(d.get("total_in", 0) for d in data)
        
        return {"type": "Haftalık Karşılaştırma", "data": [{"day": k, "visitors": v} for k, v in daily_totals.items()]}
    
    elif report_type == "store_comparison":
        store_data = []
        for d in daily_data:
            store_data.append({
                "store": d.get("store_name", ""),
                "visitors": d.get("total_in", 0) - d.get("total_out", 0),
                "in": d.get("total_in", 0),
                "out": d.get("total_out", 0)
            })
        return {"type": "Mağaza Karşılaştırma", "data": store_data}
    
    elif report_type == "queue_analysis":
        queue_list = []
        for d in daily_data:
            queue_list.append({
                "store": d.get("store_name", ""),
                "queue": d.get("avg_queue_length", 0),
                "wait_min": d.get("avg_wait_time_min", 0)
            })
        return {"type": "Kuyruk Analizi", "data": queue_list}
    
    elif report_type == "demographics":
        total_male = sum(d.get("male_count", 0) for d in daily_data)
        total_female = sum(d.get("female_count", 0) for d in daily_data)
        return {
            "type": "Demografik Analiz", 
            "data": {
                "gender": {"Male": total_male, "Female": total_female},
                "age": {}
            }
        }
    
    else:  # all
        all_data = {}
        for rt in ["hourly_traffic", "weekday_comparison", "store_comparison", "queue_analysis", "demographics"]:
            result = await generate_report_data(rt)
            all_data[rt] = result
        return {"type": "Tüm Raporlar", "data": all_data}


async def send_scheduled_report(report: dict, smtp_settings: dict):
    """Send scheduled report via email"""
    try:
        report_data = await generate_report_data(report["report_type"])
        
        # Create email
        msg = MIMEMultipart()
        msg['From'] = f"{smtp_settings['from_name']} <{smtp_settings['from_email']}>"
        msg['To'] = ", ".join(report['recipients'])
        msg['Subject'] = f"VMS360 - {report['name']} ({datetime.now().strftime('%d.%m.%Y')})"
        
        # Email body
        body = f"""
        <html>
        <body style="font-family: Arial, sans-serif; padding: 20px; background: #f9fafb;">
            <div style="max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px;">
                <h2 style="color: #3B82F6; margin-bottom: 20px;">VMS360 Retail Panel</h2>
                <h3 style="color: #1F2937;">{report['name']}</h3>
                <p style="color: #6B7280;">Rapor Tipi: <strong>{report_data['type']}</strong></p>
                <p style="color: #6B7280;">Tarih: <strong>{datetime.now().strftime('%d.%m.%Y %H:%M')}</strong></p>
                <hr style="border: 1px solid #E5E7EB; margin: 20px 0;">
                <p style="color: #6B7280;">Rapor dosyası ekte yer almaktadır.</p>
                <p style="color: #9CA3AF; font-size: 12px; margin-top: 30px;">
                    Bu e-posta VMS360 Retail Panel planlı rapor sistemi tarafından otomatik olarak gönderilmiştir.
                </p>
            </div>
        </body>
        </html>
        """
        msg.attach(MIMEText(body, 'html'))
        
        # Generate attachment
        format_type = report.get('format', 'json')
        if format_type == 'json':
            attachment_data = json.dumps(report_data['data'], indent=2, ensure_ascii=False).encode('utf-8')
            filename = f"rapor_{report['report_type']}_{datetime.now().strftime('%Y%m%d')}.json"
        elif format_type == 'csv':
            import csv
            from io import StringIO
            output = StringIO()
            data = report_data['data']
            if isinstance(data, list) and len(data) > 0:
                writer = csv.DictWriter(output, fieldnames=data[0].keys())
                writer.writeheader()
                writer.writerows(data)
            attachment_data = output.getvalue().encode('utf-8')
            filename = f"rapor_{report['report_type']}_{datetime.now().strftime('%Y%m%d')}.csv"
        else:  # excel
            import xlsxwriter
            output = BytesIO()
            workbook = xlsxwriter.Workbook(output, {'in_memory': True})
            worksheet = workbook.add_worksheet("Rapor")
            data = report_data['data']
            if isinstance(data, list) and len(data) > 0:
                headers = list(data[0].keys())
                for col, header in enumerate(headers):
                    worksheet.write(0, col, header)
                for row, item in enumerate(data, 1):
                    for col, key in enumerate(headers):
                        worksheet.write(row, col, item.get(key, ""))
            workbook.close()
            output.seek(0)
            attachment_data = output.read()
            filename = f"rapor_{report['report_type']}_{datetime.now().strftime('%Y%m%d')}.xlsx"
        
        # Attach file
        part = MIMEBase('application', 'octet-stream')
        part.set_payload(attachment_data)
        encoders.encode_base64(part)
        part.add_header('Content-Disposition', f'attachment; filename="{filename}"')
        msg.attach(part)
        
        # Send email
        if smtp_settings.get('use_tls', True):
            server = smtplib.SMTP(smtp_settings['host'], smtp_settings['port'], timeout=30)
            server.ehlo()
            server.starttls()
            server.ehlo()
        else:
            server = smtplib.SMTP_SSL(smtp_settings['host'], smtp_settings['port'], timeout=30)
            server.ehlo()
        
        server.login(smtp_settings['username'], smtp_settings['password'])
        server.send_message(msg)
        server.quit()
        
        # Update last_sent
        await db.scheduled_reports.update_one(
            {"id": report["id"]},
            {"$set": {"last_sent": datetime.now(timezone.utc).isoformat()}}
        )
        
        logger.info(f"Scheduled report '{report['name']}' sent to {report['recipients']}")
    except Exception as e:
        logger.error(f"Failed to send scheduled report: {str(e)}")


# ============== ENDPOINTS ==============

@router.get("")
async def get_scheduled_reports(user: dict = Depends(require_auth)):
    """Get all scheduled reports"""
    reports = await db.scheduled_reports.find({}, {"_id": 0}).to_list(100)
    return reports


@router.post("")
async def create_scheduled_report(report: ScheduledReportCreate, user: dict = Depends(require_admin)):
    """Create a new scheduled report (admin only)"""
    import uuid
    
    scheduled = {
        "id": str(uuid.uuid4()),
        "name": report.name,
        "report_type": report.report_type,
        "format": report.format,
        "frequency": report.frequency,
        "send_time": report.send_time,
        "send_day": report.send_day,
        "recipients": report.recipients,
        "is_active": True,
        "last_sent": None,
        "created_by": user['username'],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.scheduled_reports.insert_one(scheduled)
    scheduled.pop('_id', None)
    return scheduled


@router.put("/{report_id}")
async def update_scheduled_report(report_id: str, update: ScheduledReportUpdate, admin: dict = Depends(require_admin)):
    """Update a scheduled report (admin only)"""
    report = await db.scheduled_reports.find_one({"id": report_id})
    if not report:
        raise HTTPException(status_code=404, detail="Planlı rapor bulunamadı")
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if update_data:
        await db.scheduled_reports.update_one({"id": report_id}, {"$set": update_data})
    
    updated = await db.scheduled_reports.find_one({"id": report_id}, {"_id": 0})
    return updated


@router.delete("/{report_id}")
async def delete_scheduled_report(report_id: str, admin: dict = Depends(require_admin)):
    """Delete a scheduled report (admin only)"""
    result = await db.scheduled_reports.delete_one({"id": report_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Planlı rapor bulunamadı")
    return {"status": "deleted"}


@router.post("/{report_id}/send-now")
async def send_report_now(report_id: str, background_tasks: BackgroundTasks, admin: dict = Depends(require_admin)):
    """Manually trigger sending a scheduled report"""
    report = await db.scheduled_reports.find_one({"id": report_id}, {"_id": 0})
    if not report:
        raise HTTPException(status_code=404, detail="Planlı rapor bulunamadı")
    
    smtp_settings = await db.smtp_settings.find_one({}, {"_id": 0})
    if not smtp_settings:
        raise HTTPException(status_code=400, detail="SMTP ayarları yapılandırılmamış")
    
    background_tasks.add_task(send_scheduled_report, report, smtp_settings)
    return {"status": "queued", "message": "Rapor gönderimi başlatıldı"}
