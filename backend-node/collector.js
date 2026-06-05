/**
 * VMS360 Data Collector
 * Her 5 dakikada VMS'ten veri çekip MongoDB'ye yazar
 * Python backend'deki data_collector.py'nin Node.js karşılığı
 */
const axios = require('axios');
const { parseStringPromise } = require('xml2js');
const { getDB } = require('./db');

// ============== VMS FETCH ==============

async function fetchVmsData(server, endpoint) {
  try {
    const url = `${server.url.replace(/\/$/, '')}${endpoint}`;
    const res = await axios.get(url, {
      auth: { username: server.username, password: server.password || '' },
      timeout: 15000
    });
    return res.data;
  } catch {
    return null;
  }
}

// ============== XML PARSERS ==============

function parseCounterXml(xml) {
  const cameras = {};
  // Sagitech format: <CameraState><CameraID>...<In>...<Out>
  const stateRegex = /<CameraState>([\s\S]*?)<\/CameraState>/g;
  let m;
  while ((m = stateRegex.exec(xml)) !== null) {
    const b = m[1];
    const id = b.match(/<CameraID>([^<]+)<\/CameraID>/)?.[1]?.trim();
    if (!id) continue;
    const inCount = parseInt(b.match(/<In>([^<]+)<\/In>/)?.[1] || '0');
    const outCount = parseInt(b.match(/<Out>([^<]+)<\/Out>/)?.[1] || '0');
    cameras[id] = { in_count: inCount, out_count: outCount };
  }
  return cameras;
}

function parseQueueXml(xml) {
  const cameras = {};
  const stateRegex = /<CameraState>([\s\S]*?)<\/CameraState>/g;
  let m;
  while ((m = stateRegex.exec(xml)) !== null) {
    const b = m[1];
    const id = b.match(/<CameraID>([^<]+)<\/CameraID>/)?.[1]?.trim();
    if (!id) continue;
    const zones = [];
    const zoneRegex = /<ZoneState>([\s\S]*?)<\/ZoneState>/g;
    let z;
    while ((z = zoneRegex.exec(b)) !== null) {
      const zb = z[1];
      zones.push({
        zone_index: parseInt(zb.match(/<ZoneIndex>([^<]+)<\/ZoneIndex>/)?.[1] || '0'),
        queue_length: parseInt(zb.match(/<QueueLength>([^<]+)<\/QueueLength>/)?.[1] || '0'),
        wait_time_seconds: parseInt(zb.match(/<WaitTime>([^<]+)<\/WaitTime>/)?.[1] || '0'),
        is_queue: (zb.match(/<IsQueue>([^<]+)<\/IsQueue>/)?.[1] || 'false').toLowerCase() === 'true'
      });
    }
    cameras[id] = { zones };
  }
  return cameras;
}

function parseAnalyticsXml(xml) {
  const events = [];
  // Sagitech FR format: <Items><Item><CameraID>...<Age>...<Gender>
  const itemRegex = /<Item>([\s\S]*?)<\/Item>/g;
  let m;
  while ((m = itemRegex.exec(xml)) !== null) {
    const b = m[1];
    const cameraId = b.match(/<CameraID>([^<]+)<\/CameraID>/)?.[1]?.trim();
    const age = parseInt(b.match(/<Age>([^<]+)<\/Age>/)?.[1] || '0');
    const gender = b.match(/<Gender>([^<]+)<\/Gender>/)?.[1]?.trim() || 'Unknown';
    if (cameraId) events.push({ camera_id: cameraId, age, gender });
  }
  return events;
}

// ============== SNAPSHOT COLLECTORS ==============

async function collectCounterSnapshot() {
  try {
    const db = getDB();
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const hour = now.getUTCHours();
    const minute = now.getUTCMinutes();

    const [vmsServers, stores, cameras] = await Promise.all([
      db.collection('vms_servers').find({ is_active: true }, { projection: { _id: 0 } }).toArray(),
      db.collection('stores').find({}, { projection: { _id: 0 } }).toArray(),
      db.collection('cameras').find({ type: 'counter' }, { projection: { _id: 0 } }).toArray()
    ]);

    // VMS'ten sayaç verisi çek
    const vmsData = {};
    for (const vms of vmsServers) {
      const xml = await fetchVmsData(vms, '/rsapi/modules/counter/getstats');
      if (xml) Object.assign(vmsData, parseCounterXml(xml));
    }

    // Kamera ID → VMS kamera ID eşlemesi
    const camByStore = {};
    for (const cam of cameras) {
      if (!camByStore[cam.store_id]) camByStore[cam.store_id] = [];
      camByStore[cam.store_id].push(cam);
    }

    const ops = [];
    for (const store of stores) {
      const storeCams = camByStore[store.id] || [];
      let totalIn = 0, totalOut = 0;
      const cameraDetails = [];

      for (const cam of storeCams) {
        const d = vmsData[cam.camera_vms_id];
        if (d) {
          totalIn += d.in_count;
          totalOut += d.out_count;
          cameraDetails.push({ camera_id: cam.camera_vms_id, camera_name: cam.name, in_count: d.in_count, out_count: d.out_count });
        }
      }

      const currentVisitors = Math.max(0, totalIn - totalOut);
      const capacity = store.capacity || 100;
      const occupancy = capacity > 0 ? Math.round(currentVisitors / capacity * 1000) / 10 : 0;
      const status = occupancy >= 90 ? 'critical' : occupancy >= 70 ? 'warning' : 'normal';

      const snap = {
        store_id: store.id, store_name: store.name,
        date: dateStr, hour, minute,
        timestamp: now.toISOString(),
        total_in: totalIn, total_out: totalOut,
        current_visitors: currentVisitors, capacity,
        occupancy_percent: occupancy, status, camera_details: cameraDetails
      };

      ops.push({ updateOne: { filter: { store_id: store.id, date: dateStr, hour, minute }, update: { $set: snap }, upsert: true } });
    }

    if (ops.length) {
      await db.collection('counter_snapshots').bulkWrite(ops, { ordered: false });
      console.log(`[Collector] ${ops.length} counter snapshot kaydedildi (${dateStr} ${hour}:${String(minute).padStart(2,'0')})`);
    }
  } catch (e) {
    console.error('[Collector] Counter hata:', e.message);
  }
}

async function collectQueueSnapshot() {
  try {
    const db = getDB();
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const hour = now.getUTCHours();
    const minute = now.getUTCMinutes();

    const [vmsServers, stores, cameras] = await Promise.all([
      db.collection('vms_servers').find({ is_active: true }, { projection: { _id: 0 } }).toArray(),
      db.collection('stores').find({}, { projection: { _id: 0 } }).toArray(),
      db.collection('cameras').find({ type: 'queue' }, { projection: { _id: 0 } }).toArray()
    ]);

    const vmsData = {};
    for (const vms of vmsServers) {
      const xml = await fetchVmsData(vms, '/rsapi/modules/queue/getstats');
      if (xml) Object.assign(vmsData, parseQueueXml(xml));
    }

    const camByStore = {};
    for (const cam of cameras) {
      if (!camByStore[cam.store_id]) camByStore[cam.store_id] = [];
      camByStore[cam.store_id].push(cam);
    }

    const ops = [];
    for (const store of stores) {
      const storeCams = camByStore[store.id] || [];
      let totalQueue = 0, totalWait = 0, zoneCount = 0;
      const zoneDetails = [], cameraDetails = [];

      for (const cam of storeCams) {
        const d = vmsData[cam.camera_vms_id];
        if (d) {
          cameraDetails.push({ camera_id: cam.camera_vms_id, camera_name: cam.name, zones: d.zones });
          for (const z of d.zones || []) {
            totalQueue += z.queue_length;
            totalWait += z.wait_time_seconds || 0;
            zoneCount++;
            zoneDetails.push({ camera_id: cam.camera_vms_id, camera_name: cam.name, ...z });
          }
        }
      }

      const threshold = store.queue_threshold || 5;
      const status = totalQueue >= threshold * 1.5 ? 'critical' : totalQueue >= threshold ? 'warning' : 'normal';

      const snap = {
        store_id: store.id, store_name: store.name,
        date: dateStr, hour, minute,
        timestamp: now.toISOString(),
        total_queue_length: totalQueue,
        avg_wait_time_seconds: zoneCount > 0 ? Math.round(totalWait / zoneCount) : 0,
        zone_details: zoneDetails, zones: zoneDetails,
        camera_details: cameraDetails,
        queue_threshold: threshold, status
      };

      ops.push({ updateOne: { filter: { store_id: store.id, date: dateStr, hour, minute }, update: { $set: snap }, upsert: true } });
    }

    if (ops.length) {
      await db.collection('queue_snapshots').bulkWrite(ops, { ordered: false });
      console.log(`[Collector] ${ops.length} queue snapshot kaydedildi`);
    }
  } catch (e) {
    console.error('[Collector] Queue hata:', e.message);
  }
}

async function collectAnalyticsSnapshot() {
  try {
    const db = getDB();
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const hour = now.getUTCHours();
    const minute = now.getUTCMinutes();

    const [vmsServers, stores, cameras] = await Promise.all([
      db.collection('vms_servers').find({ is_active: true }, { projection: { _id: 0 } }).toArray(),
      db.collection('stores').find({}, { projection: { _id: 0 } }).toArray(),
      db.collection('cameras').find({ type: 'analytics' }, { projection: { _id: 0 } }).toArray()
    ]);

    const allEvents = [];
    for (const vms of vmsServers) {
      const xml = await fetchVmsData(vms, '/rsapi/modules/fr/searchevents?lastMinutes=5');
      if (xml) allEvents.push(...parseAnalyticsXml(xml));
    }

    const camByStore = {};
    for (const cam of cameras) {
      if (!camByStore[cam.store_id]) camByStore[cam.store_id] = [];
      camByStore[cam.store_id].push(cam);
    }

    const ops = [];
    for (const store of stores) {
      const storeCamIds = new Set((camByStore[store.id] || []).map(c => c.camera_vms_id));
      const storeEvents = allEvents.filter(e => storeCamIds.has(e.camera_id));

      const genderDist = { Male: 0, Female: 0, Unknown: 0 };
      const ageDist = { '0-17': 0, '18-24': 0, '25-34': 0, '35-44': 0, '45-54': 0, '55+': 0 };

      for (const e of storeEvents) {
        const g = e.gender;
        if (genderDist[g] !== undefined) genderDist[g]++; else genderDist.Unknown++;
        const age = e.age || 0;
        if (age < 18) ageDist['0-17']++;
        else if (age < 25) ageDist['18-24']++;
        else if (age < 35) ageDist['25-34']++;
        else if (age < 45) ageDist['35-44']++;
        else if (age < 55) ageDist['45-54']++;
        else ageDist['55+']++;
      }

      const snap = {
        store_id: store.id, store_name: store.name,
        date: dateStr, hour, minute,
        timestamp: now.toISOString(),
        total_events: storeEvents.length,
        gender_distribution: genderDist,
        age_distribution: ageDist
      };

      ops.push({ updateOne: { filter: { store_id: store.id, date: dateStr, hour, minute }, update: { $set: snap }, upsert: true } });
    }

    if (ops.length) {
      await db.collection('analytics_snapshots').bulkWrite(ops, { ordered: false });
      console.log(`[Collector] ${ops.length} analytics snapshot kaydedildi`);
    }
  } catch (e) {
    console.error('[Collector] Analytics hata:', e.message);
  }
}

// ============== GÜNLÜK RAPOR (her gece 02:00) ==============

async function collectDailyReport(dateStr) {
  try {
    const db = getDB();
    const targetDate = dateStr || new Date(Date.now() - 86400000).toISOString().split('T')[0]; // dün

    const stores = await db.collection('stores').find({}, { projection: { _id: 0 } }).toArray();

    for (const store of stores) {
      const [counterData, queueData, analyticsData] = await Promise.all([
        db.collection('counter_snapshots').find({ store_id: store.id, date: targetDate }, { projection: { _id: 0 } }).toArray(),
        db.collection('queue_snapshots').find({ store_id: store.id, date: targetDate }, { projection: { _id: 0 } }).toArray(),
        db.collection('analytics_snapshots').find({ store_id: store.id, date: targetDate }, { projection: { _id: 0 } }).toArray()
      ]);

      if (!counterData.length && !queueData.length) continue;

      const maxIn = counterData.length ? Math.max(...counterData.map(s => s.total_in || 0)) : 0;
      const maxOut = counterData.length ? Math.max(...counterData.map(s => s.total_out || 0)) : 0;
      const avgVisitors = counterData.length ? Math.round(counterData.reduce((s, r) => s + (r.current_visitors || 0), 0) / counterData.length) : 0;
      const avgQueue = queueData.length ? Math.round(queueData.reduce((s, r) => s + (r.total_queue_length || 0), 0) / queueData.length * 10) / 10 : 0;

      const genderTotal = { Male: 0, Female: 0, Unknown: 0 };
      const ageTotal = { '0-17': 0, '18-24': 0, '25-34': 0, '35-44': 0, '45-54': 0, '55+': 0 };
      for (const s of analyticsData) {
        for (const [k, v] of Object.entries(s.gender_distribution || {})) { if (genderTotal[k] !== undefined) genderTotal[k] += v; }
        for (const [k, v] of Object.entries(s.age_distribution || {})) { if (ageTotal[k] !== undefined) ageTotal[k] += v; }
      }

      await db.collection('daily_reports').updateOne(
        { store_id: store.id, date: targetDate },
        { $set: { store_id: store.id, store_name: store.name, date: targetDate, total_in: maxIn, total_out: maxOut, avg_visitors: avgVisitors, avg_queue_length: avgQueue, gender_distribution: genderTotal, age_distribution: ageTotal, updated_at: new Date().toISOString() } },
        { upsert: true }
      );
    }

    console.log(`[Collector] Günlük rapor oluşturuldu: ${targetDate}`);
  } catch (e) {
    console.error('[Collector] Günlük rapor hata:', e.message);
  }
}

// ============== ZAMANLAYICI ==============

function startCollector() {
  console.log('[Collector] Zamanlayıcı başlatıldı:');
  console.log('  - Snapshot: her 5 dakikada');
  console.log('  - Günlük rapor: her gece 02:00');

  // İlk çalıştırma — hemen başlat
  setTimeout(async () => {
    console.log('[Collector] İlk veri toplama başlıyor...');
    await collectCounterSnapshot();
    await collectQueueSnapshot();
    await collectAnalyticsSnapshot();
  }, 5000);

  // Her 5 dakikada çalıştır
  setInterval(async () => {
    await collectCounterSnapshot();
    await collectQueueSnapshot();
    await collectAnalyticsSnapshot();
  }, 5 * 60 * 1000);

  // Gece 02:00 günlük rapor
  scheduleDaily(2, 0, () => collectDailyReport());
}

function scheduleDaily(targetHour, targetMinute, fn) {
  function getNextDelay() {
    const now = new Date();
    const next = new Date();
    next.setHours(targetHour, targetMinute, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next - now;
  }

  function schedule() {
    setTimeout(() => {
      fn();
      schedule(); // bir sonraki gün için yeniden planla
    }, getNextDelay());
  }

  schedule();
}

module.exports = { startCollector, collectCounterSnapshot, collectQueueSnapshot, collectAnalyticsSnapshot, collectDailyReport };
