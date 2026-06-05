const express = require('express');
const { getDB } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function getDateRange(dateRange, dateFrom, dateTo) {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  if (dateFrom && dateTo) return { start: dateFrom, end: dateTo };
  if (dateRange === '7d' || dateRange === '1w') return { start: new Date(now - 7*86400000).toISOString().split('T')[0], end: today };
  if (dateRange === '30d' || dateRange === '1m') return { start: new Date(now - 30*86400000).toISOString().split('T')[0], end: today };
  return { start: today, end: today };
}

async function getLocationMaps(db) {
  const [districts, cities, regions] = await Promise.all([
    db.collection('districts').find({}, { projection: { _id: 0 } }).toArray(),
    db.collection('cities').find({}, { projection: { _id: 0 } }).toArray(),
    db.collection('regions').find({}, { projection: { _id: 0 } }).toArray()
  ]);
  return {
    distMap: Object.fromEntries(districts.map(d => [d.id, d])),
    cityMap: Object.fromEntries(cities.map(c => [c.id, c])),
    regionMap: Object.fromEntries(regions.map(r => [r.id, r]))
  };
}

// GET /api/reports/counter
router.get('/counter', requireAuth, async (req, res) => {
  try {
    const db = getDB();
    const { date_range = '1d', date_from, date_to, store_ids, hour_from, hour_to } = req.query;
    const { start, end } = getDateRange(date_range, date_from, date_to);
    const today = new Date().toISOString().split('T')[0];

    let storeIds = store_ids ? store_ids.split(',') : null;

    const activeStores = await db.collection('stores').find({}, { projection: { _id: 0, id: 1, name: 1, district_id: 1 } }).toArray();
    const activeStoreIds = new Set(activeStores.map(s => s.id));
    const storeNameMap = Object.fromEntries(activeStores.map(s => [s.id, s]));
    const { distMap, cityMap, regionMap } = await getLocationMaps(db);

    let stores = [];

    if (start === end && start === today && !hour_from && !hour_to) {
      // Bugün → son snapshot
      const match = storeIds ? { store_id: { $in: storeIds } } : {};
      const snapshots = await db.collection('counter_snapshots').aggregate([
        { $match: match }, { $sort: { timestamp: -1 } },
        { $group: { _id: '$store_id', doc: { $first: '$$ROOT' } } },
        { $replaceRoot: { newRoot: '$doc' } }, { $project: { _id: 0 } }
      ]).toArray();

      for (const snap of snapshots) {
        if (!activeStoreIds.has(snap.store_id)) continue;
        const storeInfo = storeNameMap[snap.store_id] || {};
        const dist = distMap[storeInfo.district_id] || {};
        const city = cityMap[dist.city_id] || {};
        const region = regionMap[city.region_id] || {};
        stores.push({
          store_id: snap.store_id, store_name: storeInfo.name || snap.store_name,
          district_name: dist.name || '', city_name: city.name || '', region_name: region.name || '',
          total_in: snap.total_in || 0, total_out: snap.total_out || 0,
          current_visitors: snap.current_visitors || 0, max_visitors: snap.current_visitors || 0,
          date: today, status: snap.status || 'normal'
        });
      }
    } else {
      // Tarih aralığı → daily_reports veya snapshot agregasyonu
      const query = { date: { $gte: start, $lte: end } };
      if (storeIds) query.store_id = { $in: storeIds };
      if (hour_from) query.hour = { $gte: parseInt(hour_from) };
      if (hour_to) { query.hour = query.hour || {}; query.hour.$lte = parseInt(hour_to); }

      const collection = (hour_from || hour_to) ? 'counter_snapshots' : 'daily_reports';
      const pipeline = [
        { $match: query },
        { $group: {
          _id: '$store_id',
          max_in: { $max: '$total_in' }, max_out: { $max: '$total_out' },
          avg_visitors: { $avg: '$current_visitors' || '$avg_visitors' },
          store_name: { $first: '$store_name' }
        }}
      ];
      const results = await db.collection(collection).aggregate(pipeline).toArray();

      for (const r of results) {
        if (!activeStoreIds.has(r._id)) continue;
        const storeInfo = storeNameMap[r._id] || {};
        const dist = distMap[storeInfo.district_id] || {};
        const city = cityMap[dist.city_id] || {};
        const region = regionMap[city.region_id] || {};
        stores.push({
          store_id: r._id, store_name: storeInfo.name || r.store_name,
          district_name: dist.name || '', city_name: city.name || '', region_name: region.name || '',
          total_in: r.max_in || 0, total_out: r.max_out || 0,
          current_visitors: Math.round(r.avg_visitors || 0), max_visitors: r.max_in || 0,
          date: `${start} / ${end}`, status: 'normal'
        });
      }
    }

    const totalIn = stores.reduce((s, r) => s + r.total_in, 0);
    const totalOut = stores.reduce((s, r) => s + r.total_out, 0);
    const totalVisitors = stores.reduce((s, r) => s + r.current_visitors, 0);
    const avgOccupancy = stores.length > 0 ? Math.round(stores.reduce((s, r) => s + (r.occupancy_percent || 0), 0) / stores.length) : 0;

    res.json({
      stores,
      summary: {
        total_stores: stores.length,
        total_in: totalIn,
        total_out: totalOut,
        current_visitors: totalVisitors,
        avg_occupancy: avgOccupancy,
        stores_critical: stores.filter(s => s.status === 'critical').length,
        stores_warning: stores.filter(s => s.status === 'warning').length,
        stores_normal: stores.filter(s => s.status === 'normal').length
      },
      start_date: start, end_date: end
    });
  } catch (e) { res.status(500).json({ detail: e.message }); }
});

// GET /api/reports/queue
router.get('/queue', requireAuth, async (req, res) => {
  try {
    const db = getDB();
    const { date_range = '1d', date_from, date_to, store_ids } = req.query;
    const { start, end } = getDateRange(date_range, date_from, date_to);
    const today = new Date().toISOString().split('T')[0];
    let storeIds = store_ids ? store_ids.split(',') : null;

    const activeStores = await db.collection('stores').find({}, { projection: { _id: 0, id: 1, name: 1, district_id: 1, queue_threshold: 1 } }).toArray();
    const activeStoreIds = new Set(activeStores.map(s => s.id));
    const storeMap = Object.fromEntries(activeStores.map(s => [s.id, s]));
    const { distMap, cityMap, regionMap } = await getLocationMaps(db);

    const match = storeIds ? { store_id: { $in: storeIds }, date: { $gte: start, $lte: end } } : { date: { $gte: start, $lte: end } };
    const pipeline = [
      { $match: match }, { $sort: { timestamp: -1 } },
      { $group: { _id: '$store_id', max_queue: { $max: '$total_queue_length' }, avg_queue: { $avg: '$total_queue_length' }, store_name: { $first: '$store_name' } } }
    ];
    const results = await db.collection('queue_snapshots').aggregate(pipeline).toArray();

    const stores = results.filter(r => activeStoreIds.has(r._id)).map(r => {
      const s = storeMap[r._id] || {};
      const dist = distMap[s.district_id] || {};
      const city = cityMap[dist.city_id] || {};
      const region = regionMap[city.region_id] || {};
      const threshold = s.queue_threshold || 5;
      const avgQ = Math.round((r.avg_queue || 0) * 10) / 10;
      return {
        store_id: r._id, store_name: s.name || r.store_name,
        region_name: region.name || '', city_name: city.name || '', district_name: dist.name || '',
        total_queue_length: avgQ,   // frontend bu alanı bekliyor
        max_queue_length: r.max_queue || 0,
        avg_queue_length: avgQ,
        queue_threshold: threshold, date: `${start} / ${end}`,
        status: avgQ >= threshold * 1.5 ? 'critical' : avgQ >= threshold ? 'warning' : 'normal'
      };
    });

    const totalQueue = stores.reduce((s, r) => s + r.avg_queue_length, 0);
    res.json({
      stores,
      summary: {
        total_stores: stores.length,
        total_queue_length: Math.round(totalQueue),
        avg_queue_per_store: stores.length > 0 ? Math.round(totalQueue / stores.length * 10) / 10 : 0,
        stores_critical: stores.filter(s => s.status === 'critical').length,
        stores_warning: stores.filter(s => s.status === 'warning').length,
        stores_normal: stores.filter(s => s.status === 'normal').length
      },
      start_date: start, end_date: end
    });
  } catch (e) { res.status(500).json({ detail: e.message }); }
});

// GET /api/reports/analytics
router.get('/analytics', requireAuth, async (req, res) => {
  try {
    const db = getDB();
    const { date_range = '1d', date_from, date_to, store_ids } = req.query;
    const { start, end } = getDateRange(date_range, date_from, date_to);
    let storeIds = store_ids ? store_ids.split(',') : null;

    const match = { date: { $gte: start, $lte: end } };
    if (storeIds) match.store_id = { $in: storeIds };
    const snapshots = await db.collection('analytics_snapshots').find(match, { projection: { _id: 0 } }).toArray();

    const gender = { Male: 0, Female: 0, Unknown: 0 };
    const age = { '0-17': 0, '18-24': 0, '25-34': 0, '35-44': 0, '45-54': 0, '55+': 0 };
    let total = 0;
    for (const s of snapshots) {
      total += s.total_events || 0;
      for (const [k, v] of Object.entries(s.gender_distribution || {})) if (gender[k] !== undefined) gender[k] += v;
      for (const [k, v] of Object.entries(s.age_distribution || {})) if (age[k] !== undefined) age[k] += v;
    }

    const malePercent = total > 0 ? Math.round(gender.Male / total * 100) : 0;
    const femalePercent = total > 0 ? Math.round(gender.Female / total * 100) : 0;
    res.json({
      gender_distribution: gender,
      age_distribution: age,
      summary: {
        total_detections: total,
        male_count: gender.Male,
        male_percent: malePercent,
        female_count: gender.Female,
        female_percent: femalePercent
      },
      start_date: start, end_date: end
    });
  } catch (e) { res.status(500).json({ detail: e.message }); }
});

// GET /api/reports/export
router.get('/export', requireAuth, async (req, res) => {
  try {
    const db = getDB();
    const { reportType = 'counter', format = 'json', date_range = '1d', date_from, date_to, store_ids } = req.query;
    const { start, end } = getDateRange(date_range, date_from, date_to);
    let storeIds = store_ids ? store_ids.split(',') : null;

    const match = { date: { $gte: start, $lte: end } };
    if (storeIds) match.store_id = { $in: storeIds };

    const collection = reportType === 'queue' ? 'queue_snapshots' : reportType === 'analytics' ? 'analytics_snapshots' : 'counter_snapshots';
    const data = await db.collection(collection).find(match, { projection: { _id: 0 } }).sort({ date: 1, hour: 1 }).toArray();

    if (format === 'json') return res.json(data);

    // CSV
    if (data.length === 0) return res.send('');
    const keys = Object.keys(data[0]).filter(k => typeof data[0][k] !== 'object');
    const csv = [keys.join(','), ...data.map(r => keys.map(k => `"${r[k] ?? ''}"`).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="vms360_${reportType}_${start}_${end}.csv"`);
    res.send(csv);
  } catch (e) { res.status(500).json({ detail: e.message }); }
});

module.exports = router;
