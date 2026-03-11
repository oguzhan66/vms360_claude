new_function = '''

# ============== DAILY VMS REPORT COLLECTOR ==============
async def collect_daily_vms_report(target_date: str = None):
    """
    Collect previous day\'s counter and FR analytics report from VMS.
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
        vms_config = await db.vms_config.find_one({}, {"_id": 0})
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

        # 2. FR Analytics report (Combined: age + gender + in/out)
        fr_data = None
        try:
            fr_payload = {
                "timeFrom": time_from,
                "timeTo": time_to,
                "axisXsize": "Day",
                "summarizeCameras": True,
                "reportType": "Combined",
                "cameraIds": []
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

        # Get stores for mapping camera names to store_ids
        stores = await db.stores.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(100)
        cameras = await db.cameras.find({}, {"_id": 0, "id": 1, "name": 1, "camera_vms_id": 1, "store_id": 1}).to_list(500)
        camera_store_map = {cam["camera_vms_id"]: cam.get("store_id") for cam in cameras if cam.get("camera_vms_id")}

        # Process counter rows - group by store
        store_counter = {}
        if counter_data:
            for row in counter_data.get("rows", []):
                cam_name = row.get("cameraName", "")
                # Find camera by name match
                cam_store_id = None
                for cam in cameras:
                    if cam.get("name", "") == cam_name or cam_name in cam.get("name", ""):
                        cam_store_id = cam.get("store_id")
                        break

                day_key = target_date
                day_data = row.get(day_key, {})
                in_val = day_data.get("in", 0)
                out_val = day_data.get("out", 0)
                inside_val = day_data.get("inside", 0)

                if cam_store_id:
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

        # Process FR analytics
        fr_summary = {}
        if fr_data:
            for row in fr_data.get("rows", []):
                fr_summary = {
                    "in": row.get("in", 0),
                    "out": row.get("out", 0),
                    "unique": row.get("unique", 0),
                    "male": row.get("male", 0),
                    "female": row.get("female", 0),
                    "unknown_gender": row.get("unknown", 0),
                    "age_0_17": row.get("age_0_17", 0),
                    "age_18_24": row.get("age_18_24", 0),
                    "age_25_34": row.get("age_25_34", 0),
                    "age_35_44": row.get("age_35_44", 0),
                    "age_45_54": row.get("age_45_54", 0),
                    "age_55_64": row.get("age_55_64", 0),
                    "age_65_plus": row.get("age_65_plus", 0)
                }

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
                "fr_analytics": fr_summary if fr_summary else {},
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
'''

# Append to data_collector.py
with open('/app/data_collector.py', 'a') as f:
    f.write(new_function)

print('Tamam - fonksiyon eklendi')
