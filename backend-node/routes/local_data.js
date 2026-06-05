const express = require('express');
const { getDB } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

async function getLatestSnapshots(db, storeIds, type) {
  const collection = type === 'counter' ? 'counter_snapshots' : 'queue_snapshots';
  const match = storeIds ? { store_id: { $in: storeIds } } : {};
  return db.collection(collection).aggregate([
    { $match: match },
    { $sort: { timestamp: -1 } },
    { $group: { _id: '$store_id', doc: { $first: '$$ROOT' } } },
    { $replaceRoot: { newRoot: '$doc' } },
    { $project: { _id: 0 } }
  ]).toArray();
}

async function enrichWithLocation(db, snap, store) {
  if (!store) return null;
  const district = await db.collection('districts').findOne({ id: store.district_id }, { projection: { _id: 0 } });
  const city = district ? await db.collection('cities').findOne({ id: district.city_id }, { projection: { _id: 0 } }) : null;
  const region = city ? await db.collection('regions').findOne({ id: city.region_id }, { projection: { _id: 0 } }) : null;
  return { district, city, region };
}

// GET /api/live/counter — from local DB snapshots
router.get('/live/counter', requireAuth, async (req, res) => {
  const db = getDB();
  const storeIds = req.query.store_ids ? req.query.store_ids.split(',') : null;
  const snapshots = await getLatestSnapshots(db, storeIds, 'counter');

  const [districts, cities, regions, stores] = await Promise.all([
    db.collection('districts').find({}, { projection: { _id: 0 } }).toArray(),
    db.collection('cities').find({}, { projection: { _id: 0 } }).toArray(),
    db.collection('regions').find({}, { projection: { _id: 0 } }).toArray(),
    db.collection('stores').find({}, { projection: { _id: 0 } }).toArray()
  ]);
  const distMap = Object.fromEntries(districts.map(d => [d.id, d]));
  const cityMap = Object.fromEntries(cities.map(c => [c.id, c]));
  const regionMap = Object.fromEntries(regions.map(r => [r.id, r]));
  const storeMap = Object.fromEntries(stores.map(s => [s.id, s]));

  const result = snapshots.map(snap => {
    const store = storeMap[snap.store_id] || {};
    const district = distMap[store.district_id] || {};
    const city = cityMap[district.city_id] || {};
    const region = regionMap[city.region_id] || {};
    const capacity = snap.capacity || store.capacity || 100;
    const current = snap.current_visitors || 0;
    const occupancy = capacity > 0 ? Math.round(current / capacity * 1000) / 10 : 0;
    const status = occupancy >= 90 ? 'critical' : occupancy >= 70 ? 'warning' : 'normal';
    return {
      store_id: snap.store_id, store_name: snap.store_name,
      district_id: store.district_id || '', district_name: district.name || '',
      city_id: city.id || '', city_name: city.name || '',
      region_id: region.id || '', region_name: region.name || '',
      total_in: snap.total_in || 0, total_out: snap.total_out || 0,
      current_visitors: current, capacity,
      occupancy_percent: occupancy, status: snap.status || status,
      camera_details: snap.camera_details || [],
      timestamp: snap.timestamp || '', data_source: 'local_warehouse'
    };
  });
  res.json(result);
});

// GET /api/live/queue — from local DB snapshots
router.get('/live/queue', requireAuth, async (req, res) => {
  const db = getDB();
  const storeIds = req.query.store_ids ? req.query.store_ids.split(',') : null;
  const snapshots = await getLatestSnapshots(db, storeIds, 'queue');

  const [districts, cities, regions, stores] = await Promise.all([
    db.collection('districts').find({}, { projection: { _id: 0 } }).toArray(),
    db.collection('cities').find({}, { projection: { _id: 0 } }).toArray(),
    db.collection('regions').find({}, { projection: { _id: 0 } }).toArray(),
    db.collection('stores').find({}, { projection: { _id: 0 } }).toArray()
  ]);
  const distMap = Object.fromEntries(districts.map(d => [d.id, d]));
  const cityMap = Object.fromEntries(cities.map(c => [c.id, c]));
  const regionMap = Object.fromEntries(regions.map(r => [r.id, r]));
  const storeMap = Object.fromEntries(stores.map(s => [s.id, s]));

  const result = snapshots.map(snap => {
    const store = storeMap[snap.store_id] || {};
    const district = distMap[store.district_id] || {};
    const city = cityMap[district.city_id] || {};
    const region = regionMap[city.region_id] || {};
    const threshold = store.queue_threshold || 5;
    const total = snap.total_queue_length || 0;
    const status = total >= threshold * 1.5 ? 'critical' : total >= threshold ? 'warning' : 'normal';
    return {
      store_id: snap.store_id, store_name: snap.store_name,
      district_id: store.district_id || '', district_name: district.name || '',
      city_id: city.id || '', city_name: city.name || '',
      region_id: region.id || '', region_name: region.name || '',
      total_queue_length: total, zones: snap.zones || [],
      queue_threshold: threshold, status: snap.status || status,
      camera_details: snap.camera_details || [],
      timestamp: snap.timestamp || '', data_source: 'local_warehouse'
    };
  });
  res.json(result);
});

// GET /api/reports/summary
router.get('/reports/summary', requireAuth, async (req, res) => {
  const db = getDB();
  const { region_id, city_id, district_id, store_ids } = req.query;
  let storeIds = store_ids ? store_ids.split(',') : null;

  if (district_id || city_id || region_id) {
    let districtIds = [];
    if (district_id) {
      districtIds = [district_id];
    } else if (city_id) {
      const dists = await db.collection('districts').find({ city_id }, { projection: { _id: 0, id: 1 } }).toArray();
      districtIds = dists.map(d => d.id);
    } else if (region_id) {
      const cs = await db.collection('cities').find({ region_id }, { projection: { _id: 0, id: 1 } }).toArray();
      const cIds = cs.map(c => c.id);
      const dists = await db.collection('districts').find({ city_id: { $in: cIds } }, { projection: { _id: 0, id: 1 } }).toArray();
      districtIds = dists.map(d => d.id);
    }
    if (districtIds.length) {
      const locationStores = await db.collection('stores').find({ district_id: { $in: districtIds } }, { projection: { _id: 0, id: 1 } }).toArray();
      const locationIds = locationStores.map(s => s.id);
      storeIds = storeIds ? storeIds.filter(id => locationIds.includes(id)) : locationIds;
    }
  }

  const [counterData, queueData] = await Promise.all([
    getLatestSnapshots(db, storeIds, 'counter'),
    getLatestSnapshots(db, storeIds, 'queue')
  ]);

  const queueByStore = Object.fromEntries(queueData.map(q => [q.store_id, q]));
  const [districts, cities, regions, stores] = await Promise.all([
    db.collection('districts').find({}, { projection: { _id: 0 } }).toArray(),
    db.collection('cities').find({}, { projection: { _id: 0 } }).toArray(),
    db.collection('regions').find({}, { projection: { _id: 0 } }).toArray(),
    db.collection('stores').find({}, { projection: { _id: 0 } }).toArray()
  ]);
  const distMap = Object.fromEntries(districts.map(d => [d.id, d]));
  const cityMap = Object.fromEntries(cities.map(c => [c.id, c]));
  const regionMap = Object.fromEntries(regions.map(r => [r.id, r]));
  const storeMap = Object.fromEntries(stores.map(s => [s.id, s]));

  const storeList = counterData.map(snap => {
    const store = storeMap[snap.store_id] || {};
    const district = distMap[store.district_id] || {};
    const city = cityMap[district.city_id] || {};
    const region = regionMap[city.region_id] || {};
    return {
      store_id: snap.store_id, store_name: snap.store_name,
      district_name: district.name || '', city_name: city.name || '', region_name: region.name || '',
      total_in: snap.total_in || 0, total_out: snap.total_out || 0,
      current_visitors: snap.current_visitors || 0,
      capacity: snap.capacity || store.capacity || 100,
      occupancy_percent: snap.occupancy_percent || 0, status: snap.status || 'normal'
    };
  });

  res.json({
    total_stores: storeList.length,
    stores: storeList,
    totals: {
      total_in: storeList.reduce((s, r) => s + r.total_in, 0),
      total_out: storeList.reduce((s, r) => s + r.total_out, 0),
      current_visitors: storeList.reduce((s, r) => s + r.current_visitors, 0)
    }
  });
});

// GET /api/live/analytics/stores — mağaza bazlı analytics
router.get('/live/analytics/stores', requireAuth, async (req, res) => {
  const db = getDB();
  const storeIds = req.query.store_ids ? req.query.store_ids.split(',') : null;

  // Son 24 saatteki tüm snapshot'ları topla (sadece son anlık değil)
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const match = { timestamp: { $gte: since } };
  if (storeIds) match.store_id = { $in: storeIds };

  // Mağaza bazında topla
  const aggPipeline = [
    { $match: match },
    { $group: {
      _id: '$store_id',
      store_name: { $first: '$store_name' },
      total_events: { $sum: '$total_events' },
      male: { $sum: { $ifNull: ['$gender_distribution.Male', 0] } },
      female: { $sum: { $ifNull: ['$gender_distribution.Female', 0] } },
      age_0_17: { $sum: { $ifNull: ['$age_distribution.0-17', 0] } },
      age_18_24: { $sum: { $ifNull: ['$age_distribution.18-24', 0] } },
      age_25_34: { $sum: { $ifNull: ['$age_distribution.25-34', 0] } },
      age_35_44: { $sum: { $ifNull: ['$age_distribution.35-44', 0] } },
      age_45_54: { $sum: { $ifNull: ['$age_distribution.45-54', 0] } },
      age_55_plus: { $sum: { $ifNull: ['$age_distribution.55+', 0] } }
    }}
  ];

  const rawSnapshots = await db.collection('analytics_snapshots').aggregate(aggPipeline).toArray();

  // Eğer son 24 saatte veri yoksa daha geniş aralığa bak
  const snapshots = rawSnapshots.length > 0 ? rawSnapshots.map(r => ({
    store_id: r._id, store_name: r.store_name,
    total_events: r.total_events || 0,
    gender_distribution: { Male: r.male || 0, Female: r.female || 0, Unknown: 0 },
    age_distribution: {
      '0-17': r.age_0_17 || 0, '18-24': r.age_18_24 || 0, '25-34': r.age_25_34 || 0,
      '35-44': r.age_35_44 || 0, '45-54': r.age_45_54 || 0, '55+': r.age_55_plus || 0
    }
  })) : await (async () => {
    // Fallback: tüm zamanlardan son snapshot
    return db.collection('analytics_snapshots').aggregate([
      { $sort: { timestamp: -1 } },
      { $group: { _id: '$store_id', doc: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$doc' } }, { $project: { _id: 0 } }
    ]).toArray();
  })();

  const [districts, cities, regions, stores] = await Promise.all([
    db.collection('districts').find({}, { projection: { _id: 0 } }).toArray(),
    db.collection('cities').find({}, { projection: { _id: 0 } }).toArray(),
    db.collection('regions').find({}, { projection: { _id: 0 } }).toArray(),
    db.collection('stores').find({}, { projection: { _id: 0 } }).toArray()
  ]);
  const distMap = Object.fromEntries(districts.map(d => [d.id, d]));
  const cityMap = Object.fromEntries(cities.map(c => [c.id, c]));
  const regionMap = Object.fromEntries(regions.map(r => [r.id, r]));
  const storeMap = Object.fromEntries(stores.map(s => [s.id, s]));

  const result = snapshots.map(snap => {
    const store = storeMap[snap.store_id] || {};
    const district = distMap[store.district_id] || {};
    const city = cityMap[district.city_id] || {};
    const region = regionMap[city.region_id] || {};
    const gender = snap.gender_distribution || {};
    const age = snap.age_distribution || {};
    return {
      store_id: snap.store_id, store_name: snap.store_name,
      district_id: store.district_id || '', district_name: district.name || '',
      city_id: city.id || '', city_name: city.name || '',
      region_id: region.id || '', region_name: region.name || '',
      total_detections: snap.total_events || 0,
      male_count: gender.Male || 0, female_count: gender.Female || 0,
      age_distribution: age,
      timestamp: snap.timestamp || ''
    };
  });
  res.json(result);
});

// GET /api/live/analytics — genel özet
router.get('/live/analytics', requireAuth, async (req, res) => {
  const db = getDB();
  const lastMinutes = parseInt(req.query.lastMinutes || '60');
  const since = new Date(Date.now() - lastMinutes * 60 * 1000).toISOString();

  const snapshots = await db.collection('analytics_snapshots')
    .find({ timestamp: { $gte: since } }, { projection: { _id: 0 } }).toArray();

  const gender = { Male: 0, Female: 0, Unknown: 0 };
  const age = { '0-17': 0, '18-24': 0, '25-34': 0, '35-44': 0, '45-54': 0, '55+': 0 };
  let total = 0;

  for (const s of snapshots) {
    total += s.total_events || 0;
    for (const [k, v] of Object.entries(s.gender_distribution || {})) if (gender[k] !== undefined) gender[k] += v;
    for (const [k, v] of Object.entries(s.age_distribution || {})) if (age[k] !== undefined) age[k] += v;
  }

  res.json({ total_events: total, gender_distribution: gender, age_distribution: age, events: [] });
});

module.exports = router;
