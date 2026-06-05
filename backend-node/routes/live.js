const express = require('express');
const axios = require('axios');
const { parseStringPromise } = require('xml2js');
const { getDB } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

async function fetchVmsData(server, endpoint) {
  try {
    const url = `${server.url.replace(/\/$/, '')}${endpoint}`;
    const res = await axios.get(url, { auth: { username: server.username, password: server.password || '' }, timeout: 10000 });
    return res.data;
  } catch { return null; }
}

async function parseCounterXml(xml) {
  try {
    const parsed = await parseStringPromise(xml, { explicitArray: false });
    const cameras = parsed?.report?.camera || parsed?.cameras?.camera || [];
    const list = Array.isArray(cameras) ? cameras : [cameras];
    return list.map(cam => ({
      camera_id: cam?.$ ?.id || cam?.id || '',
      in_count: parseInt(cam?.incount || cam?.$ ?.incount || cam?.in || 0),
      out_count: parseInt(cam?.outcount || cam?.$ ?.outcount || cam?.out || 0)
    })).filter(c => c.camera_id);
  } catch { return []; }
}

async function parseQueueXml(xml) {
  try {
    const parsed = await parseStringPromise(xml, { explicitArray: false });
    const cameras = parsed?.report?.camera || parsed?.cameras?.camera || [];
    const list = Array.isArray(cameras) ? cameras : [cameras];
    return list.map(cam => {
      const zones = cam?.zone ? (Array.isArray(cam.zone) ? cam.zone : [cam.zone]) : [];
      return {
        camera_id: cam?.$ ?.id || cam?.id || '',
        zones: zones.map((z, i) => ({ zone_index: i, queue_length: parseInt(z?.count || z?.$ ?.count || 0), is_queue: true }))
      };
    }).filter(c => c.camera_id);
  } catch { return []; }
}

router.get('/counter', requireAuth, async (req, res) => {
  const db = getDB();
  const { store_ids } = req.query;
  const storeQuery = store_ids ? { id: { $in: store_ids.split(',') } } : {};
  const [stores, vmsServers, cameras] = await Promise.all([
    db.collection('stores').find(storeQuery, { projection: { _id: 0 } }).toArray(),
    db.collection('vms_servers').find({ is_active: true }, { projection: { _id: 0 } }).toArray(),
    db.collection('cameras').find({ type: 'counter' }, { projection: { _id: 0 } }).toArray()
  ]);

  const vmsData = {};
  for (const vms of vmsServers) {
    const xml = await fetchVmsData(vms, '/rsapi/modules/counter/getstats');
    if (xml) {
      const parsed = await parseCounterXml(xml);
      for (const p of parsed) vmsData[p.camera_id] = p;
    }
  }

  const cameraByStore = {};
  for (const c of cameras) {
    if (!cameraByStore[c.store_id]) cameraByStore[c.store_id] = [];
    cameraByStore[c.store_id].push(c);
  }

  const [districts, cities, regions] = await Promise.all([
    db.collection('districts').find({}, { projection: { _id: 0 } }).toArray(),
    db.collection('cities').find({}, { projection: { _id: 0 } }).toArray(),
    db.collection('regions').find({}, { projection: { _id: 0 } }).toArray()
  ]);
  const distMap = Object.fromEntries(districts.map(d => [d.id, d]));
  const cityMap = Object.fromEntries(cities.map(c => [c.id, c]));
  const regionMap = Object.fromEntries(regions.map(r => [r.id, r]));

  const result = stores.map(store => {
    const storeCameras = cameraByStore[store.id] || [];
    let totalIn = 0, totalOut = 0;
    for (const cam of storeCameras) {
      const d = vmsData[cam.camera_vms_id];
      if (d) { totalIn += d.in_count; totalOut += d.out_count; }
    }
    const currentVisitors = Math.max(0, totalIn - totalOut);
    const occupancy = store.capacity > 0 ? (currentVisitors / store.capacity * 100) : 0;
    const district = distMap[store.district_id] || {};
    const city = cityMap[district.city_id] || {};
    const region = regionMap[city.region_id] || {};
    return {
      store_id: store.id, store_name: store.name,
      district_id: store.district_id, district_name: district.name || '',
      city_id: city.id || '', city_name: city.name || '',
      region_id: region.id || '', region_name: region.name || '',
      total_in: totalIn, total_out: totalOut, current_visitors: currentVisitors,
      capacity: store.capacity, occupancy_percent: Math.round(occupancy * 10) / 10,
      status: occupancy >= 95 ? 'critical' : occupancy >= 80 ? 'warning' : 'normal'
    };
  });
  res.json(result);
});

router.get('/queue', requireAuth, async (req, res) => {
  const db = getDB();
  const { store_ids } = req.query;
  const storeQuery = store_ids ? { id: { $in: store_ids.split(',') } } : {};
  const [stores, vmsServers, cameras] = await Promise.all([
    db.collection('stores').find(storeQuery, { projection: { _id: 0 } }).toArray(),
    db.collection('vms_servers').find({ is_active: true }, { projection: { _id: 0 } }).toArray(),
    db.collection('cameras').find({ type: 'queue' }, { projection: { _id: 0 } }).toArray()
  ]);

  const vmsData = {};
  for (const vms of vmsServers) {
    const xml = await fetchVmsData(vms, '/rsapi/modules/queue/getstats');
    if (xml) {
      const parsed = await parseQueueXml(xml);
      for (const p of parsed) vmsData[p.camera_id] = p;
    }
  }

  const cameraByStore = {};
  for (const c of cameras) {
    if (!cameraByStore[c.store_id]) cameraByStore[c.store_id] = [];
    cameraByStore[c.store_id].push(c);
  }

  const [districts, cities, regions] = await Promise.all([
    db.collection('districts').find({}, { projection: { _id: 0 } }).toArray(),
    db.collection('cities').find({}, { projection: { _id: 0 } }).toArray(),
    db.collection('regions').find({}, { projection: { _id: 0 } }).toArray()
  ]);
  const distMap = Object.fromEntries(districts.map(d => [d.id, d]));
  const cityMap = Object.fromEntries(cities.map(c => [c.id, c]));
  const regionMap = Object.fromEntries(regions.map(r => [r.id, r]));

  const result = stores.map(store => {
    const storeCameras = cameraByStore[store.id] || [];
    const zones = [];
    let totalQueue = 0;
    for (const cam of storeCameras) {
      const d = vmsData[cam.camera_vms_id];
      if (d) {
        for (const zone of d.zones || []) {
          totalQueue += zone.queue_length;
          zones.push({ camera_name: cam.name, ...zone });
        }
      }
    }
    const district = distMap[store.district_id] || {};
    const city = cityMap[district.city_id] || {};
    const region = regionMap[city.region_id] || {};
    const threshold = store.queue_threshold || 5;
    return {
      store_id: store.id, store_name: store.name,
      district_name: district.name || '', city_name: city.name || '', region_name: region.name || '',
      total_queue_length: totalQueue, queue_threshold: threshold, zones,
      status: totalQueue >= threshold * 2 ? 'critical' : totalQueue >= threshold ? 'warning' : 'normal'
    };
  });
  res.json(result);
});

router.get('/analytics', requireAuth, async (req, res) => {
  const result = { total_events: 0, gender_distribution: { Male: 0, Female: 0, Unknown: 0 }, age_distribution: { '0-17': 0, '18-24': 0, '25-34': 0, '35-44': 0, '45-54': 0, '55+': 0 }, events: [] };
  res.json(result);
});

module.exports = router;
