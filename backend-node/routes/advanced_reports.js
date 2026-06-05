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

// GET /api/reports/advanced/hourly-traffic
router.get('/hourly-traffic', requireAuth, async (req, res) => {
  try {
    const db = getDB();
    const { date_range = '1d', date_from, date_to, store_ids } = req.query;
    const { start, end } = getDateRange(date_range, date_from, date_to);
    let storeIds = store_ids ? store_ids.split(',') : null;

    const match = { date: { $gte: start, $lte: end } };
    if (storeIds) match.store_id = { $in: storeIds };

    const pipeline = [
      { $match: match },
      { $group: {
        _id: '$hour',
        avg_in: { $avg: '$total_in' }, avg_out: { $avg: '$total_out' },
        avg_visitors: { $avg: '$current_visitors' }, max_visitors: { $max: '$current_visitors' },
        count: { $sum: 1 }
      }},
      { $sort: { _id: 1 } }
    ];

    const results = await db.collection('counter_snapshots').aggregate(pipeline).toArray();

    const hourly = Array.from({ length: 24 }, (_, h) => {
      const r = results.find(x => x._id === h) || {};
      return {
        hour: h, label: `${String(h).padStart(2,'0')}:00`,
        avg_in: Math.round(r.avg_in || 0), avg_out: Math.round(r.avg_out || 0),
        avg_visitors: Math.round(r.avg_visitors || 0), max_visitors: r.max_visitors || 0
      };
    });

    const peakHour = hourly.reduce((max, h) => h.avg_visitors > max.avg_visitors ? h : max, hourly[0]);
    res.json({ hourly_data: hourly, peak_hour: peakHour, start_date: start, end_date: end });
  } catch (e) { res.status(500).json({ detail: e.message }); }
});

// GET /api/reports/advanced/weekday-comparison
router.get('/weekday-comparison', requireAuth, async (req, res) => {
  try {
    const db = getDB();
    const { date_range = '30d', date_from, date_to, store_ids } = req.query;
    const { start, end } = getDateRange(date_range, date_from, date_to);
    let storeIds = store_ids ? store_ids.split(',') : null;

    const match = { date: { $gte: start, $lte: end } };
    if (storeIds) match.store_id = { $in: storeIds };

    const docs = await db.collection('daily_reports').find(match, { projection: { _id: 0 } }).toArray();

    const days = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
    const byDay = Array.from({ length: 7 }, (_, i) => ({ day: days[i], day_num: i, total_in: 0, count: 0 }));

    for (const doc of docs) {
      const dayNum = new Date(doc.date).getDay();
      byDay[dayNum].total_in += doc.total_in || 0;
      byDay[dayNum].count++;
    }

    const weekdays = byDay.map(d => ({ ...d, avg_in: d.count > 0 ? Math.round(d.total_in / d.count) : 0 }));
    res.json({ weekday_data: weekdays, start_date: start, end_date: end });
  } catch (e) { res.status(500).json({ detail: e.message }); }
});

// GET /api/reports/advanced/store-comparison
router.get('/store-comparison', requireAuth, async (req, res) => {
  try {
    const db = getDB();
    const { date_range = '7d', date_from, date_to, store_ids, region_id, city_id } = req.query;
    const { start, end } = getDateRange(date_range, date_from, date_to);
    let storeIds = store_ids ? store_ids.split(',') : null;

    if (!storeIds && (region_id || city_id)) {
      let distIds = [];
      if (city_id) {
        const dists = await db.collection('districts').find({ city_id }, { projection: { _id: 0, id: 1 } }).toArray();
        distIds = dists.map(d => d.id);
      } else if (region_id) {
        const cities = await db.collection('cities').find({ region_id }, { projection: { _id: 0, id: 1 } }).toArray();
        const cIds = cities.map(c => c.id);
        const dists = await db.collection('districts').find({ city_id: { $in: cIds } }, { projection: { _id: 0, id: 1 } }).toArray();
        distIds = dists.map(d => d.id);
      }
      if (distIds.length) {
        const ss = await db.collection('stores').find({ district_id: { $in: distIds } }, { projection: { _id: 0, id: 1 } }).toArray();
        storeIds = ss.map(s => s.id);
      }
    }

    const match = { date: { $gte: start, $lte: end } };
    if (storeIds) match.store_id = { $in: storeIds };

    const pipeline = [
      { $match: match },
      { $group: {
        _id: '$store_id', store_name: { $first: '$store_name' },
        total_in: { $sum: '$total_in' }, avg_visitors: { $avg: '$current_visitors' || '$avg_visitors' },
        max_visitors: { $max: '$current_visitors' || '$avg_visitors' }, days: { $sum: 1 }
      }},
      { $sort: { total_in: -1 } }
    ];

    const results = await db.collection('daily_reports').aggregate(pipeline).toArray();
    const stores = await db.collection('stores').find({}, { projection: { _id: 0, id: 1, capacity: 1 } }).toArray();
    const capMap = Object.fromEntries(stores.map(s => [s.id, s.capacity || 100]));

    const comparison = results.map(r => ({
      store_id: r._id, store_name: r.store_name,
      total_in: r.total_in || 0, avg_daily_in: r.days > 0 ? Math.round(r.total_in / r.days) : 0,
      avg_visitors: Math.round(r.avg_visitors || 0), max_visitors: r.max_visitors || 0,
      capacity: capMap[r._id] || 100
    }));

    res.json({ stores: comparison, start_date: start, end_date: end });
  } catch (e) { res.status(500).json({ detail: e.message }); }
});

// GET /api/reports/advanced/queue-analysis
router.get('/queue-analysis', requireAuth, async (req, res) => {
  try {
    const db = getDB();
    const { date_range = '7d', date_from, date_to, store_ids } = req.query;
    const { start, end } = getDateRange(date_range, date_from, date_to);
    let storeIds = store_ids ? store_ids.split(',') : null;

    const match = { date: { $gte: start, $lte: end } };
    if (storeIds) match.store_id = { $in: storeIds };

    const pipeline = [
      { $match: match },
      { $group: {
        _id: '$store_id', store_name: { $first: '$store_name' },
        avg_queue: { $avg: '$total_queue_length' }, max_queue: { $max: '$total_queue_length' },
        avg_wait: { $avg: '$avg_wait_time_seconds' }
      }},
      { $sort: { avg_queue: -1 } }
    ];

    const results = await db.collection('queue_snapshots').aggregate(pipeline).toArray();
    const storesDb = await db.collection('stores').find({}, { projection: { _id: 0, id: 1, queue_threshold: 1 } }).toArray();
    const threshMap = Object.fromEntries(storesDb.map(s => [s.id, s.queue_threshold || 5]));

    // Saatlik yoğunluk — kritik saatler
    const hourlyPipeline = [
      { $match: match },
      { $group: { _id: '$hour', avg_queue: { $avg: '$total_queue_length' } } },
      { $sort: { avg_queue: -1 } }, { $limit: 3 }
    ];
    const hourlyResults = await db.collection('queue_snapshots').aggregate(hourlyPipeline).toArray();
    const criticalHours = hourlyResults.map(h => `${String(h._id).padStart(2,'0')}:00`);

    const stores = results.map(r => ({
      store_id: r._id, store_name: r.store_name,
      queue_length: Math.round(r.avg_queue * 10) / 10,
      max_queue_length: r.max_queue || 0,
      avg_wait_minutes: Math.round((r.avg_wait || 0) / 60 * 10) / 10,
      threshold: threshMap[r._id] || 5,
      exceeds_threshold: (r.avg_queue || 0) >= (threshMap[r._id] || 5),
      status: (r.avg_queue || 0) >= (threshMap[r._id] || 5) * 1.5 ? 'critical' : (r.avg_queue || 0) >= (threshMap[r._id] || 5) ? 'warning' : 'normal'
    }));

    const totalQueue = stores.reduce((s, r) => s + r.queue_length, 0);
    const avgQueue = stores.length > 0 ? Math.round(totalQueue / stores.length * 10) / 10 : 0;
    const avgWait = stores.length > 0 ? Math.round(stores.reduce((s, r) => s + r.avg_wait_minutes, 0) / stores.length * 10) / 10 : 0;

    res.json({
      total_stores: stores.length,
      total_queue_length: Math.round(totalQueue),
      average_queue_length: avgQueue,
      average_wait_time_minutes: avgWait,
      stores_exceeding_threshold: stores.filter(s => s.exceeds_threshold).length,
      critical_hours: criticalHours,
      stores,
      start_date: start, end_date: end
    });
  } catch (e) { res.status(500).json({ detail: e.message }); }
});

// GET /api/reports/advanced/demographics
router.get('/demographics', requireAuth, async (req, res) => {
  try {
    const db = getDB();
    const { date_range = '7d', date_from, date_to, store_ids } = req.query;
    const { start, end } = getDateRange(date_range, date_from, date_to);
    let storeIds = store_ids ? store_ids.split(',') : null;

    const match = { date: { $gte: start, $lte: end } };
    if (storeIds) match.store_id = { $in: storeIds };

    const snapshots = await db.collection('analytics_snapshots').find(match, { projection: { _id: 0 } }).toArray();

    const gender = { Male: 0, Female: 0, Unknown: 0 };
    const age = { '0-17': 0, '18-24': 0, '25-34': 0, '35-44': 0, '45-54': 0, '55+': 0 };
    let total = 0;

    const byStore = {};
    for (const s of snapshots) {
      total += s.total_events || 0;
      for (const [k, v] of Object.entries(s.gender_distribution || {})) if (gender[k] !== undefined) gender[k] += v;
      for (const [k, v] of Object.entries(s.age_distribution || {})) if (age[k] !== undefined) age[k] += v;
      if (!byStore[s.store_id]) byStore[s.store_id] = { store_id: s.store_id, store_name: s.store_name, total_events: 0, male: 0, female: 0 };
      byStore[s.store_id].total_events += s.total_events || 0;
      byStore[s.store_id].male += (s.gender_distribution?.Male || 0);
      byStore[s.store_id].female += (s.gender_distribution?.Female || 0);
    }

    res.json({
      total_events: total, gender_distribution: gender, age_distribution: age,
      stores: Object.values(byStore), start_date: start, end_date: end
    });
  } catch (e) { res.status(500).json({ detail: e.message }); }
});

module.exports = router;
