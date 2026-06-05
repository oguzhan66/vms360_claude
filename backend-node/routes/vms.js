const express = require('express');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const { parseStringPromise } = require('xml2js');
const { getDB } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

async function fetchVmsData(server, endpoint) {
  try {
    const url = `${server.url.replace(/\/$/, '')}${endpoint}`;
    const response = await axios.get(url, {
      auth: { username: server.username, password: server.password || '' },
      timeout: 10000
    });
    return response.data;
  } catch {
    return null;
  }
}

router.post('/', requireAuth, async (req, res) => {
  const db = getDB();
  const doc = { id: uuidv4(), is_active: true, created_at: new Date().toISOString(), password: '', ...req.body };
  await db.collection('vms_servers').insertOne(doc);
  const { _id, ...out } = doc;
  res.json(out);
});

router.get('/', requireAuth, async (req, res) => {
  const db = getDB();
  const servers = await db.collection('vms_servers').find({}, { projection: { _id: 0 } }).toArray();
  res.json(servers);
});

router.get('/:id', requireAuth, async (req, res) => {
  const db = getDB();
  const server = await db.collection('vms_servers').findOne({ id: req.params.id }, { projection: { _id: 0 } });
  if (!server) return res.status(404).json({ detail: 'VMS bulunamadı' });
  res.json(server);
});

router.put('/:id', requireAuth, async (req, res) => {
  const db = getDB();
  const update = Object.fromEntries(Object.entries(req.body).filter(([, v]) => v !== undefined && v !== null));
  const result = await db.collection('vms_servers').updateOne({ id: req.params.id }, { $set: update });
  if (result.matchedCount === 0) return res.status(404).json({ detail: 'VMS bulunamadı' });
  const updated = await db.collection('vms_servers').findOne({ id: req.params.id }, { projection: { _id: 0 } });
  res.json(updated);
});

router.delete('/:id', requireAuth, async (req, res) => {
  const db = getDB();
  const result = await db.collection('vms_servers').deleteOne({ id: req.params.id });
  if (result.deletedCount === 0) return res.status(404).json({ detail: 'VMS bulunamadı' });
  res.json({ status: 'deleted' });
});

router.get('/:id/test', requireAuth, async (req, res) => {
  const db = getDB();
  const server = await db.collection('vms_servers').findOne({ id: req.params.id }, { projection: { _id: 0 } });
  if (!server) return res.status(404).json({ detail: 'VMS bulunamadı' });
  const data = await fetchVmsData(server, '/rsapi/cameras');
  if (data) return res.json({ status: 'connected', message: 'VMS bağlantısı başarılı' });
  res.json({ status: 'error', message: 'VMS bağlantısı kurulamadı' });
});

async function parseCameraListXml(xml) {
  try {
    const allCameras = {};
    const parsed = await parseStringPromise(xml, { explicitArray: false, ignoreAttrs: false });

    // Olası kök elementleri dene
    const root = parsed?.Cameras || parsed?.cameras || parsed?.CameraList || parsed?.Items || parsed;
    let list = root?.Camera || root?.camera || root?.Item || root?.item || [];
    if (!Array.isArray(list)) list = list ? [list] : [];

    for (const cam of list) {
      const attrs = cam?.$ || {};
      const id = cam?.ID || cam?.Id || cam?.id || cam?.CameraID || cam?.cameraId || attrs?.id || attrs?.ID;
      if (!id) continue;
      const name = cam?.Name || cam?.name || attrs?.name || attrs?.Name || `Kamera ${String(id).substring(0, 8)}`;
      const disabled = (cam?.Disabled || cam?.disabled || 'false').toString().toLowerCase() === 'true';
      allCameras[String(id).trim()] = {
        camera_id: String(id).trim(), name: String(name).trim(),
        disabled, has_counter: false, has_queue: false, has_analytics: false, type: 'general'
      };
    }
    return allCameras;
  } catch { return {}; }
}

function parseCounterXml(xml) {
  const cameras = {};
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
    cameras[id] = { zones: [] };
  }
  return cameras;
}

router.get('/:id/cameras', requireAuth, async (req, res) => {
  const db = getDB();
  const server = await db.collection('vms_servers').findOne({ id: req.params.id }, { projection: { _id: 0 } });
  if (!server) return res.status(404).json({ detail: 'VMS bulunamadı' });

  const allCameras = {};

  // Kamera listesini çek
  const cameraListXml = await fetchVmsData(server, '/rsapi/cameras');
  if (cameraListXml) {
    const parsed = await parseCameraListXml(cameraListXml);
    Object.assign(allCameras, parsed);
  }

  // Sayaç modülü kameralarını işaretle
  const counterXml = await fetchVmsData(server, '/rsapi/modules/counter/getstats');
  if (counterXml) {
    const counterCams = parseCounterXml(counterXml);
    for (const [id, data] of Object.entries(counterCams)) {
      if (allCameras[id]) {
        allCameras[id].has_counter = true;
        allCameras[id].type = 'counter';
        allCameras[id] = { ...allCameras[id], ...data };
      } else {
        allCameras[id] = { camera_id: id, name: `Sayaç Kamera ${id.substring(0, 8)}`, has_counter: true, has_queue: false, has_analytics: false, type: 'counter', ...data };
      }
    }
  }

  // Kuyruk modülü kameralarını işaretle
  const queueXml = await fetchVmsData(server, '/rsapi/modules/queue/getstats');
  if (queueXml) {
    const queueCams = parseQueueXml(queueXml);
    for (const [id] of Object.entries(queueCams)) {
      if (allCameras[id]) {
        allCameras[id].has_queue = true;
        if (allCameras[id].type === 'general') allCameras[id].type = 'queue';
      } else {
        allCameras[id] = { camera_id: id, name: `Kuyruk Kamera ${id.substring(0, 8)}`, has_counter: false, has_queue: true, has_analytics: false, type: 'queue' };
      }
    }
  }

  // Yaş/Cinsiyet (FR/Analytics) modülü kameralarını işaretle
  const frXml = await fetchVmsData(server, '/rsapi/modules/fr/analytics/getstats');
  if (frXml) {
    const frCams = parseCounterXml(frXml);
    for (const [id] of Object.entries(frCams)) {
      if (allCameras[id]) {
        allCameras[id].has_analytics = true;
        if (allCameras[id].type === 'general') allCameras[id].type = 'analytics';
      } else {
        allCameras[id] = { camera_id: id, name: `Analitik Kamera ${id.substring(0, 8)}`, has_counter: false, has_queue: false, has_analytics: true, type: 'analytics' };
      }
    }
  }

  const cameras = Object.values(allCameras).sort((a, b) => (a.disabled ? 1 : 0) - (b.disabled ? 1 : 0) || a.name.localeCompare(b.name));
  res.json({ vms_id: req.params.id, vms_name: server.name, cameras, total: cameras.length });
});

router.post('/:id/import-cameras', requireAuth, async (req, res) => {
  const db = getDB();
  const server = await db.collection('vms_servers').findOne({ id: req.params.id }, { projection: { _id: 0 } });
  if (!server) return res.status(404).json({ detail: 'VMS bulunamadı' });

  const { camera_ids = [], store_id = '' } = req.body;
  let imported = 0, skipped = 0;

  // VMS'den güncel kamera bilgilerini çek (isim ve tip için)
  const allCameras = {};
  const cameraListXml = await fetchVmsData(server, '/rsapi/cameras');
  if (cameraListXml) Object.assign(allCameras, await parseCameraListXml(cameraListXml));
  const counterXml = await fetchVmsData(server, '/rsapi/modules/counter/getstats');
  if (counterXml) { for (const [id] of Object.entries(parseCounterXml(counterXml))) { if (allCameras[id]) { allCameras[id].has_counter = true; allCameras[id].type = 'counter'; } } }
  const queueXml = await fetchVmsData(server, '/rsapi/modules/queue/getstats');
  if (queueXml) { for (const [id] of Object.entries(parseQueueXml(queueXml))) { if (allCameras[id]) { allCameras[id].has_queue = true; if (allCameras[id].type === 'general') allCameras[id].type = 'queue'; } } }
  const frXml = await fetchVmsData(server, '/rsapi/modules/fr/analytics/getstats');
  if (frXml) { for (const [id] of Object.entries(parseCounterXml(frXml))) { if (allCameras[id]) { allCameras[id].has_analytics = true; if (allCameras[id].type === 'general') allCameras[id].type = 'analytics'; } } }

  for (const camId of camera_ids) {
    const existing = await db.collection('cameras').findOne({ camera_vms_id: camId, store_id });
    if (existing) { skipped++; continue; }
    const camInfo = allCameras[camId] || {};
    await db.collection('cameras').insertOne({
      id: uuidv4(),
      store_id,
      camera_vms_id: camId,
      name: camInfo.name || `Kamera ${camId.substring(0, 8)}`,
      type: camInfo.type || 'counter',
      is_active: true,
      created_at: new Date().toISOString()
    });
    imported++;
  }

  res.json({ status: 'success', imported, skipped, message: `${imported} kamera eklendi, ${skipped} kamera zaten mevcut` });
});

module.exports = router;
