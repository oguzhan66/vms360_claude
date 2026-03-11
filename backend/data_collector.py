"""
Data Collection Service for VMS360
Collects data from VMS at regular intervals and stores in MongoDB
All reports and analytics are generated from this local data warehouse
"""
import asyncio
import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict
from pymongo import UpdateOne
from database import db
from vms_utils import fetch_vms_data, parse_counter_xml, parse_queue_xml, parse_analytics_xml

logger = logging.getLogger(__name__)


# ============== EMAIL ALERT FUNCTIONS ==============

async def send_health_alert_email(newly_offline: List[dict], newly_online: List[dict]):
    """Send email alerts for store health status changes"""
    try:
        # Get SMTP settings
        smtp_settings = await db.smtp_settings.find_one({}, {"_id": 0})
        if not smtp_settings or not smtp_settings.get("enabled"):
            logger.info("SMTP not configured or disabled, skipping health alert email")
            return
        
        # Get alert recipients
        alert_settings = await db.alert_settings.find_one({}, {"_id": 0})
        recipients = alert_settings.get("health_alert_emails", []) if alert_settings else []
        
        if not recipients:
            # Fallback: use SMTP from_email as recipient
            recipients = [smtp_settings.get("from_email")]
        
        if not recipients or not recipients[0]:
            logger.warning("No alert recipients configured")
            return
        
        # Build email content
        subject_parts = []
        body_parts = []
        
        if newly_offline:
            subject_parts.append(f"⚠️ {len(newly_offline)} mağaza çevrimdışı")
            body_parts.append("<h2 style='color: #EF4444;'>🔴 Çevrimdışı Olan Mağazalar</h2>")
            body_parts.append("<ul>")
            for store in newly_offline:
                last_data = store.get('last_data', 'Bilinmiyor')
                body_parts.append(f"<li><strong>{store['store_name']}</strong> - Son veri: {last_data}</li>")
            body_parts.append("</ul>")
        
        if newly_online:
            subject_parts.append(f"✅ {len(newly_online)} mağaza tekrar çevrimiçi")
            body_parts.append("<h2 style='color: #10B981;'>🟢 Tekrar Çevrimiçi Olan Mağazalar</h2>")
            body_parts.append("<ul>")
            for store in newly_online:
                body_parts.append(f"<li><strong>{store['store_name']}</strong></li>")
            body_parts.append("</ul>")
        
        if not subject_parts:
            return
        
        subject = f"VMS360 Alarm: {' | '.join(subject_parts)}"
        
        html_body = f"""
        <html>
        <body style="font-family: Arial, sans-serif; padding: 20px;">
            <div style="background: #1a1a2e; color: white; padding: 20px; border-radius: 8px;">
                <h1 style="margin: 0;">VMS360 Sağlık Uyarısı</h1>
                <p style="color: #888; margin-top: 5px;">{datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')} UTC</p>
            </div>
            <div style="padding: 20px;">
                {''.join(body_parts)}
            </div>
            <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin-top: 20px;">
                <p style="margin: 0; color: #666; font-size: 12px;">
                    Bu otomatik bir uyarı emailidir. Dashboard'dan detaylı bilgi alabilirsiniz.
                </p>
            </div>
        </body>
        </html>
        """
        
        # Send email
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = smtp_settings.get("from_email")
        msg['To'] = ", ".join(recipients)
        
        msg.attach(MIMEText(html_body, 'html'))
        
        # Connect and send
        if smtp_settings.get("use_tls"):
            server = smtplib.SMTP(smtp_settings["host"], smtp_settings["port"], timeout=30)
            server.ehlo()
            server.starttls()
            server.ehlo()
        else:
            server = smtplib.SMTP_SSL(smtp_settings["host"], smtp_settings["port"], timeout=30)
            server.ehlo()
        
        if smtp_settings.get("username") and smtp_settings.get("password"):
            server.login(smtp_settings["username"], smtp_settings["password"])
        
        server.sendmail(msg['From'], recipients, msg.as_string())
        server.quit()
        
        logger.info(f"Health alert email sent to {recipients}: {subject}")
        
    except Exception as e:
        logger.error(f"Failed to send health alert email: {e}")


# ============== HEALTH TRACKING ==============

async def update_store_health(store_id: str, data_type: str):
    """Update store health status when data is received"""
    try:
        await db.store_health.update_one(
            {"store_id": store_id},
            {
                "$set": {
                    f"last_{data_type}_at": datetime.now(timezone.utc).isoformat(),
                    "status": "online",
                    "updated_at": datetime.now(timezone.utc).isoformat()
                },
                "$setOnInsert": {
                    "store_id": store_id,
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
            },
            upsert=True
        )
    except Exception as e:
        logger.error(f"Error updating store health for {store_id}: {e}")

# ============== DATA COLLECTION FUNCTIONS ==============

async def collect_counter_snapshot():
    """Collect counter data from all VMS servers and save snapshot"""
    try:
        timestamp = datetime.now(timezone.utc)
        date_str = timestamp.strftime('%Y-%m-%d')
        hour = timestamp.hour
        minute = timestamp.minute
        
        vms_servers = await db.vms_servers.find({"is_active": True}, {"_id": 0}).to_list(100)
        stores = await db.stores.find({}, {"_id": 0}).to_list(500)
        
        # Collect data from VMS
        vms_data = {}
        for vms in vms_servers:
            try:
                xml_data = await fetch_vms_data(vms, "/rsapi/modules/counter/getstats")
                if xml_data:
                    parsed = parse_counter_xml(xml_data)
                    # parsed is {'cameras': [...]} dict
                    for p in parsed.get('cameras', []):
                        # Calculate in/out from counters
                        in_count = sum(c.get('in_count', 0) for c in p.get('counters', []))
                        out_count = sum(c.get('out_count', 0) for c in p.get('counters', []))
                        vms_data[p["camera_id"]] = {
                            "camera_id": p["camera_id"],
                            "in_count": in_count,
                            "out_count": out_count,
                            "last_reset": p.get("last_reset", "")
                        }
            except Exception as e:
                logger.error(f"Error fetching counter data from VMS {vms.get('name')}: {e}")
        
        # Save snapshot for each store
        snapshots = []
        for store in stores:
            counter_camera_ids = store.get("counter_camera_ids", [])
            if store.get("counter_camera_id") and store["counter_camera_id"] not in counter_camera_ids:
                counter_camera_ids.append(store["counter_camera_id"])
            
            total_in = 0
            total_out = 0
            camera_details = []
            
            for cam_id in counter_camera_ids:
                cam_data = vms_data.get(cam_id)
                if cam_data:
                    in_count = cam_data.get("in_count", 0)
                    out_count = cam_data.get("out_count", 0)
                    total_in += in_count
                    total_out += out_count
                    camera_details.append({
                        "camera_id": cam_id,
                        "camera_name": cam_id[:8],
                        "in_count": in_count,
                        "out_count": out_count
                    })
            
            current_visitors = max(0, total_in - total_out)
            capacity = store.get("capacity", 100)
            occupancy_percent = round((current_visitors / capacity * 100), 1) if capacity > 0 else 0
            
            # Calculate status based on occupancy
            if occupancy_percent >= 90:
                status = "critical"
            elif occupancy_percent >= 70:
                status = "warning"
            else:
                status = "normal"
            
            snapshot = {
                "store_id": store["id"],
                "store_name": store["name"],
                "date": date_str,
                "hour": hour,
                "minute": minute,
                "timestamp": timestamp.isoformat(),
                "total_in": total_in,
                "total_out": total_out,
                "current_visitors": current_visitors,
                "capacity": capacity,
                "occupancy_percent": occupancy_percent,
                "status": status,
                "camera_details": camera_details
            }
            snapshots.append(snapshot)
        
        # Use bulk upsert to prevent duplicates
        if snapshots:
            operations = []
            for snap in snapshots:
                # Unique key: store_id + date + hour + minute
                filter_key = {
                    "store_id": snap["store_id"],
                    "date": snap["date"],
                    "hour": snap["hour"],
                    "minute": snap["minute"]
                }
                operations.append(
                    UpdateOne(filter_key, {"$set": snap}, upsert=True)
                )
            
            result = await db.counter_snapshots.bulk_write(operations, ordered=False)
            logger.info(f"Saved {len(snapshots)} counter snapshots at {timestamp.isoformat()} (upserted: {result.upserted_count}, modified: {result.modified_count})")
            
            # Update health status for each store
            for snap in snapshots:
                await update_store_health(snap["store_id"], "counter")
        
        return snapshots
    except Exception as e:
        logger.error(f"Error collecting counter snapshot: {e}")
        return []


async def collect_queue_snapshot():
    """Collect queue data from all VMS servers and save snapshot"""
    try:
        timestamp = datetime.now(timezone.utc)
        date_str = timestamp.strftime('%Y-%m-%d')
        hour = timestamp.hour
        minute = timestamp.minute
        
        vms_servers = await db.vms_servers.find({"is_active": True}, {"_id": 0}).to_list(100)
        stores = await db.stores.find({}, {"_id": 0}).to_list(500)
        
        cameras = await db.cameras.find({}, {"_id": 0}).to_list(1000)
        camera_names = {c["id"]: c.get("name", c["id"][:8]) for c in cameras}
        
        # Collect data from VMS
        vms_data = {}
        for vms in vms_servers:
            try:
                xml_data = await fetch_vms_data(vms, "/rsapi/modules/queue/getstats")
                if xml_data:
                    parsed = parse_queue_xml(xml_data)
                    # parsed is {'cameras': [...]} dict
                    for p in parsed.get('cameras', []):
                        vms_data[p["camera_id"]] = p
            except Exception as e:
                logger.error(f"Error fetching queue data from VMS {vms.get('name')}: {e}")
        
        # Save snapshot for each store
        snapshots = []
        for store in stores:
            queue_camera_ids = store.get("queue_camera_ids", [])
            if store.get("queue_camera_id") and store["queue_camera_id"] not in queue_camera_ids:
                queue_camera_ids.append(store["queue_camera_id"])
            
            total_queue = 0
            total_wait_time = 0
            zone_count = 0
            zone_details = []
            
            for cam_id in queue_camera_ids:
                cam_data = vms_data.get(cam_id)
                if cam_data:
                    for zone in cam_data.get("zones", []):
                        queue_len = zone.get("queue_length", 0)
                        wait_time = zone.get("wait_time_seconds", 0)
                        total_queue += queue_len
                        total_wait_time += wait_time
                        zone_count += 1
                        zone_details.append({
                            "camera_id": cam_id,
                            "camera_name": camera_names.get(cam_id, cam_id[:8]),
                            "zone_id": zone.get("zone_id"),
                            "zone_name": zone.get("zone_name", ""),
                            "queue_length": queue_len,
                            "wait_time_seconds": wait_time
                        })
            
            avg_wait_time = round(total_wait_time / zone_count, 1) if zone_count > 0 else 0
            
            # Build camera_details for compatibility with local_data.py
            camera_details = []
            for cam_id in queue_camera_ids:
                cam_data = vms_data.get(cam_id)
                if cam_data:
                    camera_details.append({
                        "camera_id": cam_id,
                        "camera_name": camera_names.get(cam_id, cam_id[:8]),
                        "zones": cam_data.get("zones", [])
                    })
            
            # Calculate status based on queue threshold
            queue_threshold = store.get("queue_threshold", 5)
            if total_queue >= queue_threshold * 1.5:
                status = "critical"
            elif total_queue >= queue_threshold:
                status = "warning"
            else:
                status = "normal"
            
            snapshot = {
                "store_id": store["id"],
                "store_name": store["name"],
                "date": date_str,
                "hour": hour,
                "minute": minute,
                "timestamp": timestamp.isoformat(),
                "total_queue_length": total_queue,
                "avg_wait_time_seconds": avg_wait_time,
                "zone_count": zone_count,
                "zone_details": zone_details,
                "zones": zone_details,  # Alias for local_data.py compatibility
                "camera_details": camera_details,  # For local_data.py compatibility
                "queue_threshold": queue_threshold,
                "status": status
            }
            snapshots.append(snapshot)
        
        # Use bulk upsert to prevent duplicates
        if snapshots:
            operations = []
            for snap in snapshots:
                # Unique key: store_id + date + hour + minute
                filter_key = {
                    "store_id": snap["store_id"],
                    "date": snap["date"],
                    "hour": snap["hour"],
                    "minute": snap["minute"]
                }
                operations.append(
                    UpdateOne(filter_key, {"$set": snap}, upsert=True)
                )
            
            result = await db.queue_snapshots.bulk_write(operations, ordered=False)
            logger.info(f"Saved {len(snapshots)} queue snapshots at {timestamp.isoformat()} (upserted: {result.upserted_count}, modified: {result.modified_count})")
            
            # Update health status for each store
            for snap in snapshots:
                await update_store_health(snap["store_id"], "queue")
        
        return snapshots
    except Exception as e:
        logger.error(f"Error collecting queue snapshot: {e}")
        return []


async def collect_analytics_snapshot():
    """Collect age/gender analytics data from all VMS servers and save snapshot"""
    try:
        timestamp = datetime.now(timezone.utc)
        date_str = timestamp.strftime('%Y-%m-%d')
        hour = timestamp.hour
        minute = timestamp.minute
        
        vms_servers = await db.vms_servers.find({"is_active": True}, {"_id": 0}).to_list(100)
        stores = await db.stores.find({}, {"_id": 0}).to_list(500)
        
        # Collect data from VMS using face recognition search endpoint
        vms_data = {}
        for vms in vms_servers:
            try:
                # Use face recognition search endpoint for last 5 minutes
                xml_data = await fetch_vms_data(vms, "/rsapi/modules/fr/searchevents?lastMinutes=5")
                if xml_data:
                    parsed = parse_analytics_xml(xml_data)
                    # parsed is {'cameras': [...]} dict
                    for p in parsed.get('cameras', []):
                        # Transform to expected format with events from detections
                        events = []
                        for det in p.get('detections', []):
                            events.append({
                                'gender': det.get('gender', 'Unknown'),
                                'age': int(det.get('age', 0)) if det.get('age') else 0
                            })
                        vms_data[p["camera_id"]] = {
                            "camera_id": p["camera_id"],
                            "events": events
                        }
            except Exception as e:
                logger.error(f"Error fetching analytics data from VMS {vms.get('name')}: {e}")
        
        # Save snapshot for each store
        snapshots = []
        for store in stores:
            analytics_camera_ids = store.get("analytics_camera_ids", [])
            if store.get("analytics_camera_id") and store["analytics_camera_id"] not in analytics_camera_ids:
                analytics_camera_ids.append(store["analytics_camera_id"])
            
            gender_counts = {"Male": 0, "Female": 0, "Unknown": 0}
            age_counts = {"0-17": 0, "18-24": 0, "25-34": 0, "35-44": 0, "45-54": 0, "55+": 0}
            total_events = 0
            
            for cam_id in analytics_camera_ids:
                cam_data = vms_data.get(cam_id)
                if cam_data:
                    for event in cam_data.get("events", []):
                        total_events += 1
                        gender = event.get("gender", "Unknown")
                        age = event.get("age", 0)
                        
                        if gender in gender_counts:
                            gender_counts[gender] += 1
                        else:
                            gender_counts["Unknown"] += 1
                        
                        # Categorize age
                        if age < 18:
                            age_counts["0-17"] += 1
                        elif age < 25:
                            age_counts["18-24"] += 1
                        elif age < 35:
                            age_counts["25-34"] += 1
                        elif age < 45:
                            age_counts["35-44"] += 1
                        elif age < 55:
                            age_counts["45-54"] += 1
                        else:
                            age_counts["55+"] += 1
            
            # Build camera_details for API compatibility
            camera_details = []
            for cam_id in analytics_camera_ids:
                cam_data = vms_data.get(cam_id)
                if cam_data:
                    camera_details.append({
                        "camera_id": cam_id,
                        "events": cam_data.get("events", [])
                    })
            
            snapshot = {
                "store_id": store["id"],
                "store_name": store["name"],
                "date": date_str,
                "hour": hour,
                "minute": minute,
                "timestamp": timestamp.isoformat(),
                "total_events": total_events,
                "gender_distribution": gender_counts,
                "age_distribution": age_counts,
                "camera_details": camera_details
            }
            snapshots.append(snapshot)
        
        # Use bulk upsert to prevent duplicates
        if snapshots:
            operations = []
            for snap in snapshots:
                # Unique key: store_id + date + hour + minute
                filter_key = {
                    "store_id": snap["store_id"],
                    "date": snap["date"],
                    "hour": snap["hour"],
                    "minute": snap["minute"]
                }
                operations.append(
                    UpdateOne(filter_key, {"$set": snap}, upsert=True)
                )
            
            result = await db.analytics_snapshots.bulk_write(operations, ordered=False)
            logger.info(f"Saved {len(snapshots)} analytics snapshots at {timestamp.isoformat()} (upserted: {result.upserted_count}, modified: {result.modified_count})")
            
            # Update health status for each store
            for snap in snapshots:
                await update_store_health(snap["store_id"], "analytics")
        
        return snapshots
    except Exception as e:
        logger.error(f"Error collecting analytics snapshot: {e}")
        return []


async def collect_all_snapshots():
    """Collect all types of snapshots"""
    logger.info("Starting data collection cycle...")
    await collect_counter_snapshot()
    await collect_queue_snapshot()
    await collect_analytics_snapshot()
    logger.info("Data collection cycle completed")


# ============== DAILY AGGREGATION FUNCTIONS ==============

async def create_hourly_aggregates(date_str: str = None):
    """Create hourly aggregates from snapshots for a given date"""
    if not date_str:
        date_str = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    
    try:
        stores = await db.stores.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(500)
        
        for store in stores:
            store_id = store["id"]
            
            # Aggregate counter data by hour
            counter_pipeline = [
                {"$match": {"store_id": store_id, "date": date_str}},
                {"$group": {
                    "_id": "$hour",
                    "max_in": {"$max": "$total_in"},
                    "max_out": {"$max": "$total_out"},
                    "avg_visitors": {"$avg": "$current_visitors"},
                    "max_visitors": {"$max": "$current_visitors"},
                    "avg_occupancy": {"$avg": "$occupancy_percent"},
                    "snapshot_count": {"$sum": 1}
                }},
                {"$sort": {"_id": 1}}
            ]
            
            counter_hourly = await db.counter_snapshots.aggregate(counter_pipeline).to_list(24)
            
            # Aggregate queue data by hour
            queue_pipeline = [
                {"$match": {"store_id": store_id, "date": date_str}},
                {"$group": {
                    "_id": "$hour",
                    "avg_queue": {"$avg": "$total_queue_length"},
                    "max_queue": {"$max": "$total_queue_length"},
                    "avg_wait_time": {"$avg": "$avg_wait_time_seconds"},
                    "snapshot_count": {"$sum": 1}
                }},
                {"$sort": {"_id": 1}}
            ]
            
            queue_hourly = await db.queue_snapshots.aggregate(queue_pipeline).to_list(24)
            
            # Aggregate analytics data by hour
            analytics_pipeline = [
                {"$match": {"store_id": store_id, "date": date_str}},
                {"$group": {
                    "_id": "$hour",
                    "total_events": {"$sum": "$total_events"},
                    "male_count": {"$sum": "$gender_distribution.Male"},
                    "female_count": {"$sum": "$gender_distribution.Female"},
                    "snapshot_count": {"$sum": 1}
                }},
                {"$sort": {"_id": 1}}
            ]
            
            analytics_hourly = await db.analytics_snapshots.aggregate(analytics_pipeline).to_list(24)
            
            # Build hourly data array (0-23)
            hourly_data = []
            for hour in range(24):
                counter_data = next((c for c in counter_hourly if c["_id"] == hour), None)
                queue_data = next((q for q in queue_hourly if q["_id"] == hour), None)
                analytics_data = next((a for a in analytics_hourly if a["_id"] == hour), None)
                
                hourly_data.append({
                    "hour": hour,
                    "in_count": counter_data["max_in"] if counter_data else 0,
                    "out_count": counter_data["max_out"] if counter_data else 0,
                    "avg_visitors": round(counter_data["avg_visitors"], 1) if counter_data else 0,
                    "max_visitors": counter_data["max_visitors"] if counter_data else 0,
                    "avg_occupancy": round(counter_data["avg_occupancy"], 1) if counter_data else 0,
                    "avg_queue": round(queue_data["avg_queue"], 1) if queue_data else 0,
                    "max_queue": queue_data["max_queue"] if queue_data else 0,
                    "avg_wait_time_min": round(queue_data["avg_wait_time"] / 60, 1) if queue_data else 0,
                    "analytics_events": analytics_data["total_events"] if analytics_data else 0,
                    "male_count": analytics_data["male_count"] if analytics_data else 0,
                    "female_count": analytics_data["female_count"] if analytics_data else 0
                })
            
            # Save or update hourly aggregate
            await db.hourly_aggregates.update_one(
                {"store_id": store_id, "date": date_str},
                {"$set": {
                    "store_id": store_id,
                    "store_name": store["name"],
                    "date": date_str,
                    "hourly_data": hourly_data,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }},
                upsert=True
            )
        
        logger.info(f"Created hourly aggregates for {len(stores)} stores on {date_str}")
    except Exception as e:
        logger.error(f"Error creating hourly aggregates: {e}")


async def create_daily_summary(date_str: str = None):
    """Create daily summary from snapshots - called at end of day (23:59)"""
    if not date_str:
        # Default to TODAY for end-of-day summary (called at 23:59)
        date_str = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    
    try:
        stores = await db.stores.find({}, {"_id": 0}).to_list(500)
        
        for store in stores:
            store_id = store["id"]
            
            # Get the LAST (highest) counter values for today from snapshots
            # This represents the final count before VMS resets at midnight
            last_counter = await db.counter_snapshots.find_one(
                {"store_id": store_id, "date": date_str},
                {"_id": 0},
                sort=[("timestamp", -1)]  # Get the latest snapshot
            )
            
            # Get hourly aggregate for detailed analysis
            hourly_agg = await db.hourly_aggregates.find_one(
                {"store_id": store_id, "date": date_str},
                {"_id": 0}
            )
            
            hourly_data = hourly_agg.get("hourly_data", []) if hourly_agg else []
            
            # Use the FINAL counter values from the last snapshot of the day
            # These are the cumulative totals before VMS resets
            total_in = last_counter.get("total_in", 0) if last_counter else 0
            total_out = last_counter.get("total_out", 0) if last_counter else 0
            
            # Calculate averages from hourly data
            avg_visitors = round(sum(h["avg_visitors"] for h in hourly_data) / len(hourly_data), 1) if hourly_data else 0
            max_visitors = max(h["max_visitors"] for h in hourly_data) if hourly_data else 0
            avg_occupancy = round(sum(h["avg_occupancy"] for h in hourly_data) / len(hourly_data), 1) if hourly_data else 0
            
            # Find peak hours (only consider business hours with data)
            business_hours = [h for h in hourly_data if h["in_count"] > 0]
            peak_hour = max(business_hours, key=lambda x: x["avg_visitors"])["hour"] if business_hours else 12
            quietest_hour = min(business_hours, key=lambda x: x["avg_visitors"])["hour"] if business_hours else 6
            
            # Queue stats
            avg_queue = round(sum(h["avg_queue"] for h in hourly_data) / len(hourly_data), 1) if hourly_data else 0
            max_queue = max(h["max_queue"] for h in hourly_data) if hourly_data else 0
            avg_wait_time = round(sum(h["avg_wait_time_min"] for h in hourly_data) / len(hourly_data), 1) if hourly_data else 0
            
            # Analytics stats
            total_analytics_events = sum(h["analytics_events"] for h in hourly_data) if hourly_data else 0
            total_male = sum(h["male_count"] for h in hourly_data) if hourly_data else 0
            total_female = sum(h["female_count"] for h in hourly_data) if hourly_data else 0
            
            # Get district/city/region info
            district = await db.districts.find_one({"id": store.get("district_id")}, {"_id": 0})
            city = None
            region = None
            if district:
                city = await db.cities.find_one({"id": district.get("city_id")}, {"_id": 0})
                if city:
                    region = await db.regions.find_one({"id": city.get("region_id")}, {"_id": 0})
            
            daily_summary = {
                "store_id": store_id,
                "store_name": store["name"],
                "district_id": store.get("district_id"),
                "district_name": district["name"] if district else "",
                "city_id": city["id"] if city else "",
                "city_name": city["name"] if city else "",
                "region_id": region["id"] if region else "",
                "region_name": region["name"] if region else "",
                "date": date_str,
                "capacity": store.get("capacity", 100),
                # Counter metrics - FINAL values of the day
                "total_in": total_in,
                "total_out": total_out,
                "avg_visitors": avg_visitors,
                "max_visitors": max_visitors,
                "avg_occupancy": avg_occupancy,
                "peak_hour": peak_hour,
                "quietest_hour": quietest_hour,
                # Queue metrics
                "avg_queue_length": avg_queue,
                "max_queue_length": max_queue,
                "avg_wait_time_min": avg_wait_time,
                # Analytics metrics
                "total_analytics_events": total_analytics_events,
                "male_count": total_male,
                "female_count": total_female,
                "male_percent": round(total_male / (total_male + total_female) * 100, 1) if (total_male + total_female) > 0 else 50,
                "female_percent": round(total_female / (total_male + total_female) * 100, 1) if (total_male + total_female) > 0 else 50,
                # Metadata
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            
            await db.daily_summaries.update_one(
                {"store_id": store_id, "date": date_str},
                {"$set": daily_summary},
                upsert=True
            )
        
        logger.info(f"Created daily summaries for {len(stores)} stores on {date_str}")
    except Exception as e:
        logger.error(f"Error creating daily summary: {e}")


# ============== DATA QUERY FUNCTIONS ==============

async def get_store_daily_data(store_id: str, date_str: str) -> Optional[dict]:
    """Get daily summary for a store"""
    return await db.daily_summaries.find_one(
        {"store_id": store_id, "date": date_str},
        {"_id": 0}
    )


async def get_store_hourly_data(store_id: str, date_str: str) -> Optional[dict]:
    """Get hourly data for a store"""
    return await db.hourly_aggregates.find_one(
        {"store_id": store_id, "date": date_str},
        {"_id": 0}
    )


async def get_date_range_data(store_id: str, start_date: str, end_date: str) -> List[dict]:
    """Get daily summaries for a date range"""
    return await db.daily_summaries.find(
        {
            "store_id": store_id,
            "date": {"$gte": start_date, "$lte": end_date}
        },
        {"_id": 0}
    ).sort("date", 1).to_list(365)


async def get_all_stores_daily_data(date_str: str, store_ids: List[str] = None) -> List[dict]:
    """Get daily summaries for all stores or specific stores"""
    query = {"date": date_str}
    if store_ids:
        query["store_id"] = {"$in": store_ids}
    
    return await db.daily_summaries.find(query, {"_id": 0}).to_list(500)


async def get_latest_snapshots(store_id: str = None) -> dict:
    """Get the most recent snapshots for live display"""
    query = {}
    if store_id:
        query["store_id"] = store_id
    
    # Get latest counter snapshot
    counter = await db.counter_snapshots.find_one(
        query,
        {"_id": 0},
        sort=[("timestamp", -1)]
    )
    
    # Get latest queue snapshot
    queue = await db.queue_snapshots.find_one(
        query,
        {"_id": 0},
        sort=[("timestamp", -1)]
    )
    
    # Get latest analytics snapshot
    analytics = await db.analytics_snapshots.find_one(
        query,
        {"_id": 0},
        sort=[("timestamp", -1)]
    )
    
    return {
        "counter": counter,
        "queue": queue,
        "analytics": analytics
    }


# ============== CLEANUP FUNCTIONS ==============

async def cleanup_old_snapshots(days_to_keep: int = 7):
    """Remove snapshots older than specified days to save space"""
    cutoff_date = (datetime.now(timezone.utc) - timedelta(days=days_to_keep)).strftime('%Y-%m-%d')
    
    try:
        counter_result = await db.counter_snapshots.delete_many({"date": {"$lt": cutoff_date}})
        queue_result = await db.queue_snapshots.delete_many({"date": {"$lt": cutoff_date}})
        analytics_result = await db.analytics_snapshots.delete_many({"date": {"$lt": cutoff_date}})
        
        logger.info(f"Cleaned up old snapshots before {cutoff_date}: "
                   f"counter={counter_result.deleted_count}, "
                   f"queue={queue_result.deleted_count}, "
                   f"analytics={analytics_result.deleted_count}")
    except Exception as e:
        logger.error(f"Error cleaning up old snapshots: {e}")


# ============== INDEX CREATION ==============

async def ensure_indexes():
    """Create necessary indexes for efficient queries - called from database.py"""
    from database import create_indexes
    await create_indexes()


# ============== HEALTH CHECK FUNCTIONS ==============

async def check_store_health():
    """Check all stores for stale data and update status"""
    try:
        threshold_minutes = 30  # Alert if no data for 30 minutes
        cutoff_time = (datetime.now(timezone.utc) - timedelta(minutes=threshold_minutes)).isoformat()
        
        # Get all store health records
        health_records = await db.store_health.find({}, {"_id": 0}).to_list(500)
        stores = await db.stores.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(500)
        
        store_names = {s["id"]: s["name"] for s in stores}
        offline_stores = []
        newly_offline = []  # Stores that just went offline
        newly_online = []   # Stores that just came back online
        
        for health in health_records:
            store_id = health.get("store_id")
            previous_status = health.get("status", "unknown")
            last_counter = health.get("last_counter_at", "")
            last_queue = health.get("last_queue_at", "")
            last_analytics = health.get("last_analytics_at", "")
            
            # Get the most recent data timestamp
            timestamps = [t for t in [last_counter, last_queue, last_analytics] if t]
            latest = max(timestamps) if timestamps else ""
            
            # Check if data is stale
            if not latest or latest < cutoff_time:
                # Mark as offline
                await db.store_health.update_one(
                    {"store_id": store_id},
                    {"$set": {
                        "status": "offline",
                        "offline_since": cutoff_time,
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }}
                )
                offline_stores.append(store_names.get(store_id, store_id))
                
                # Check if this is a new offline event (wasn't already offline)
                if previous_status != "offline":
                    newly_offline.append({
                        "store_id": store_id,
                        "store_name": store_names.get(store_id, store_id),
                        "last_data": latest
                    })
            else:
                # Store is online - check if it just recovered
                if previous_status == "offline":
                    newly_online.append({
                        "store_id": store_id,
                        "store_name": store_names.get(store_id, store_id)
                    })
                    # Update status to online
                    await db.store_health.update_one(
                        {"store_id": store_id},
                        {"$set": {
                            "status": "online",
                            "offline_since": None,
                            "updated_at": datetime.now(timezone.utc).isoformat()
                        }}
                    )
        
        # Create health records for stores without any
        existing_store_ids = {h["store_id"] for h in health_records}
        for store in stores:
            if store["id"] not in existing_store_ids:
                await db.store_health.update_one(
                    {"store_id": store["id"]},
                    {
                        "$set": {
                            "status": "unknown",
                            "updated_at": datetime.now(timezone.utc).isoformat()
                        },
                        "$setOnInsert": {
                            "store_id": store["id"],
                            "created_at": datetime.now(timezone.utc).isoformat()
                        }
                    },
                    upsert=True
                )
        
        if offline_stores:
            logger.warning(f"Stores with stale data (>{threshold_minutes} min): {', '.join(offline_stores)}")
        
        # Send email alerts for status changes
        if newly_offline or newly_online:
            await send_health_alert_email(newly_offline, newly_online)
        
        return offline_stores
    except Exception as e:
        logger.error(f"Error checking store health: {e}")
        return []


async def get_system_health() -> dict:
    """Get overall system health status"""
    try:
        stores = await db.stores.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(500)
        health_records = await db.store_health.find({}, {"_id": 0}).to_list(500)
        
        health_map = {h["store_id"]: h for h in health_records}
        
        online_count = 0
        offline_count = 0
        unknown_count = 0
        store_statuses = []
        
        for store in stores:
            health = health_map.get(store["id"], {})
            status = health.get("status", "unknown")
            
            if status == "online":
                online_count += 1
            elif status == "offline":
                offline_count += 1
            else:
                unknown_count += 1
            
            store_statuses.append({
                "store_id": store["id"],
                "store_name": store["name"],
                "status": status,
                "last_counter_at": health.get("last_counter_at"),
                "last_queue_at": health.get("last_queue_at"),
                "last_analytics_at": health.get("last_analytics_at"),
                "offline_since": health.get("offline_since")
            })
        
        # Calculate overall status
        if offline_count > 0:
            overall_status = "degraded" if online_count > 0 else "critical"
        elif unknown_count == len(stores):
            overall_status = "unknown"
        else:
            overall_status = "healthy"
        
        return {
            "status": overall_status,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "summary": {
                "total_stores": len(stores),
                "online": online_count,
                "offline": offline_count,
                "unknown": unknown_count
            },
            "stores": store_statuses
        }
    except Exception as e:
        logger.error(f"Error getting system health: {e}")
        return {
            "status": "error",
            "error": str(e),
            "timestamp": datetime.now(timezone.utc).isoformat()
        }


# ============== DAILY VMS REPORT COLLECTOR ==============
async def collect_daily_vms_report(target_date: str = None):
    """
    Collect previous day's counter and FR analytics report from VMS.
    Runs at 02:00 every night. Stores in daily_reports collection.
    """
    try:
        if target_date is None:
            # Default: yesterday
            yesterday = datetime.now(timezone.utc) - timedelta(days=1)
            target_date = yesterday.strftime("%Y-%m-%d")

        time_from = f"{target_date}T00:00:00"
        time_to = f"{target_date}T23:59:59"

        logger.info(f"Collecting daily VMS report for {target_date}")

        # Get VMS config
        vms_config = await db.vms_servers.find_one({"is_active": True}, {"_id": 0})
        if not vms_config:
            logger.error("VMS config not found")
            return

        vms_url = vms_config.get("url", "")
        vms_user = vms_config.get("username", "admin")
        vms_password = vms_config.get("password", "")
        auth_params = f"user={vms_user}&password={vms_password}"

        import httpx

        # 1. Counter report
        counter_data = None
        try:
            counter_payload = {
                "timeFrom": time_from,
                "timeTo": time_to,
                "axisXsize": "Day",
                "summarizeCameras": False
            }
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    f"{vms_url}/rsapi/modules/counter/report?{auth_params}",
                    json=counter_payload
                )
                if resp.status_code == 200:
                    counter_data = resp.json()
                    logger.info(f"Counter report received: {len(counter_data.get('rows', []))} cameras")
        except Exception as e:
            logger.error(f"Counter report error: {e}")

        # Get stores and cameras for mapping
        stores = await db.stores.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(100)
        cameras = await db.cameras.find({}, {"_id": 0, "id": 1, "name": 1, "camera_vms_id": 1, "store_id": 1, "floor_id": 1, "type": 1}).to_list(500)
        floors = await db.floors.find({}, {"_id": 0, "id": 1, "store_id": 1}).to_list(100)
        floor_store_map = {f["id"]: f["store_id"] for f in floors}
        for cam in cameras:
            if not cam.get("store_id") and cam.get("floor_id"):
                cam["store_id"] = floor_store_map.get(cam["floor_id"], "")
        # Only cameras assigned to a store — used for all type mappings
        camera_store_map = {
            cam["camera_vms_id"]: cam.get("store_id")
            for cam in cameras
            if cam.get("camera_vms_id") and cam.get("store_id")
        }
        # Camera IDs per type, only store-assigned ones
        counter_camera_ids = [
            cam["camera_vms_id"]
            for cam in cameras
            if cam.get("type") == "counter" and cam.get("store_id") and cam.get("camera_vms_id")
        ]
        queue_camera_ids = [
            cam["camera_vms_id"]
            for cam in cameras
            if cam.get("type") == "queue" and cam.get("store_id") and cam.get("camera_vms_id")
        ]
        fr_camera_ids = [
            cam["camera_vms_id"]
            for cam in cameras
            if cam.get("type") == "analytics" and cam.get("store_id") and cam.get("camera_vms_id")
        ]

        # 2. Queue — aggregate from our own queue_snapshots (VMS has no queue report API)
        store_queue = {}
        try:
            queue_pipeline = [
                {"$match": {"date": target_date}},
                {"$group": {
                    "_id": "$store_id",
                    "avg_queue": {"$avg": "$total_queue_length"},
                    "max_queue": {"$max": "$total_queue_length"},
                    "avg_wait_seconds": {"$avg": "$avg_wait_time_seconds"},
                    "snapshot_count": {"$sum": 1}
                }}
            ]
            queue_agg = await db.queue_snapshots.aggregate(queue_pipeline).to_list(100)
            for row in queue_agg:
                sid = row["_id"]
                store_queue[sid] = {
                    "avg_queue": round(row["avg_queue"] or 0, 2),
                    "max_queue": row["max_queue"] or 0,
                    "avg_wait_seconds": round(row["avg_wait_seconds"] or 0, 1),
                    "snapshot_count": row["snapshot_count"],
                    "source": "snapshots"
                }
            logger.info(f"Queue aggregated from snapshots for {len(store_queue)} stores on {target_date}")
        except Exception as e:
            logger.error(f"Queue snapshot aggregation error: {e}")

        # 3. FR Analytics report — per camera so we can map to store
        fr_data = None
        try:
            fr_payload = {
                "timeFrom": time_from,
                "timeTo": time_to,
                "axisXsize": "Day",
                "summarizeCameras": False,
                "reportType": "Combined",
                "cameraIds": fr_camera_ids
            }
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    f"{vms_url}/rsapi/modules/fr/analytics/report?{auth_params}",
                    json=fr_payload
                )
                if resp.status_code == 200:
                    fr_data = resp.json()
                    logger.info(f"FR analytics report received: {len(fr_data.get('rows', []))} rows")
        except Exception as e:
            logger.error(f"FR analytics report error: {e}")

        def _resolve_store(cam_id, cam_name):
            """Match camera to store: by ID first, then by name (only store-assigned cameras)."""
            sid = camera_store_map.get(cam_id)
            if not sid:
                for cam in cameras:
                    if cam.get("store_id") and (
                        cam.get("name", "") == cam_name or cam_name in cam.get("name", "")
                    ):
                        sid = cam.get("store_id")
                        break
            return sid

        # Process counter rows — only store-assigned cameras
        store_counter = {}
        if counter_data:
            for row in counter_data.get("rows", []):
                cam_id = row.get("cameraId", "")
                cam_name = row.get("cameraName", "")
                cam_store_id = _resolve_store(cam_id, cam_name)
                if not cam_store_id:
                    continue
                day_data = row.get(target_date, {})
                in_val = day_data.get("in", 0)
                out_val = day_data.get("out", 0)
                inside_val = day_data.get("inside", 0)
                if cam_store_id not in store_counter:
                    store_counter[cam_store_id] = {"total_in": 0, "total_out": 0, "cameras": []}
                store_counter[cam_store_id]["total_in"] += in_val
                store_counter[cam_store_id]["total_out"] += out_val
                store_counter[cam_store_id]["cameras"].append({
                    "camera_name": cam_name,
                    "in": in_val,
                    "out": out_val,
                    "inside": inside_val
                })

        # Process FR analytics — per camera, group by store
        store_fr = {}
        if fr_data:
            for row in fr_data.get("rows", []):
                cam_id = row.get("cameraId", "")
                cam_name = row.get("cameraName", "")
                # Match by cameraId first, then by name
                cam_store_id = camera_store_map.get(cam_id)
                if not cam_store_id:
                    for cam in cameras:
                        if cam.get("name", "") == cam_name or cam_name in cam.get("name", ""):
                            cam_store_id = cam.get("store_id")
                            break
                if not cam_store_id:
                    continue

                def _add(a, b):
                    return (a or 0) + (b or 0)

                if cam_store_id not in store_fr:
                    store_fr[cam_store_id] = {
                        "in": 0, "out": 0, "unique": 0,
                        "male": 0, "female": 0, "unknown_gender": 0,
                        "age_0_17": 0, "age_18_24": 0, "age_25_34": 0,
                        "age_35_44": 0, "age_45_54": 0, "age_55_64": 0, "age_65_plus": 0
                    }
                s = store_fr[cam_store_id]
                s["in"] = _add(s["in"], row.get("in", 0))
                s["out"] = _add(s["out"], row.get("out", 0))
                s["unique"] = _add(s["unique"], row.get("unique", 0))
                s["male"] = _add(s["male"], row.get("male", 0))
                s["female"] = _add(s["female"], row.get("female", 0))
                s["unknown_gender"] = _add(s["unknown_gender"], row.get("unknown", 0))
                s["age_0_17"] = _add(s["age_0_17"], row.get("age_0_17", 0))
                s["age_18_24"] = _add(s["age_18_24"], row.get("age_18_24", 0))
                s["age_25_34"] = _add(s["age_25_34"], row.get("age_25_34", 0))
                s["age_35_44"] = _add(s["age_35_44"], row.get("age_35_44", 0))
                s["age_45_54"] = _add(s["age_45_54"], row.get("age_45_54", 0))
                s["age_55_64"] = _add(s["age_55_64"], row.get("age_55_64", 0))
                s["age_65_plus"] = _add(s["age_65_plus"], row.get("age_65_plus", 0))

        # Save to daily_reports collection
        operations = []
        for store in stores:
            sid = store["id"]
            counter_info = store_counter.get(sid, {"total_in": 0, "total_out": 0, "cameras": []})
            doc = {
                "date": target_date,
                "store_id": sid,
                "store_name": store["name"],
                "source": "vms_report_api",
                "counter": counter_info,
                "queue": store_queue.get(sid, {}),
                "fr_analytics": store_fr.get(sid, {}),
                "collected_at": datetime.now(timezone.utc).isoformat()
            }
            operations.append(UpdateOne(
                {"date": target_date, "store_id": sid},
                {"$set": doc},
                upsert=True
            ))

        if operations:
            result = await db.daily_reports.bulk_write(operations)
            logger.info(f"Daily report saved: {result.upserted_count} inserted, {result.modified_count} updated for {target_date}")

    except Exception as e:
        logger.error(f"collect_daily_vms_report error: {e}", exc_info=True)
