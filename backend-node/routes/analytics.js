const express = require('express');
const { getDB } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function getDateRange(dateFrom, dateTo, period = 'week') {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  if (dateFrom && dateTo) return { start: dateFrom, end: dateTo };
  if (period === 'day') return { start: today, end: today };
  if (period === 'month') return { start: new Date(now - 30*86400000).toISOString().split('T')[0], end: today };
  return { start: new Date(now - 7*86400000).toISOString().split('T')[0], end: today };
}

async function getLatestSnapshots(db, storeIds, type = 'counter') {
  const col = type === 'queue' ? 'queue_snapshots' : type === 'analytics' ? 'analytics_snapshots' : 'counter_snapshots';
  const match = storeIds ? { store_id: { $in: storeIds } } : {};
  return db.collection(col).aggregate([
    { $match: match }, { $sort: { timestamp: -1 } },
    { $group: { _id: '$store_id', doc: { $first: '$$ROOT' } } },
    { $replaceRoot: { newRoot: '$doc' } }, { $project: { _id: 0 } }
  ]).toArray();
}

// 1. GET /api/analytics/dashboard-summary
router.get('/dashboard-summary', requireAuth, async (req, res) => {
  try {
    const db = getDB();
    const { store_id, date_from, date_to } = req.query;
    const today = new Date().toISOString().split('T')[0];
    const { start, end } = getDateRange(date_from, date_to, 'week');
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    const storeIds = store_id ? [store_id] : null;
    const match = { date: { $gte: start, $lte: end } };
    if (storeIds) match.store_id = { $in: storeIds };
    const matchYest = { date: yesterday };
    if (storeIds) matchYest.store_id = { $in: storeIds };

    const [snapshots, yesterdaySnaps, totalStores] = await Promise.all([
      db.collection('counter_snapshots').find(match, { projection: { _id: 0 } }).toArray(),
      db.collection('counter_snapshots').find(matchYest, { projection: { _id: 0 } }).toArray(),
      db.collection('stores').countDocuments(storeIds ? { id: { $in: storeIds } } : {})
    ]);

    const todaySnaps = snapshots.filter(s => s.date === today);
    const todayVisitors = todaySnaps.length ? Math.max(...todaySnaps.map(s => s.total_in || 0)) : 0;
    const yesterdayVisitors = yesterdaySnaps.length ? Math.max(...yesterdaySnaps.map(s => s.total_in || 0)) : 0;
    const visitorChange = yesterdayVisitors > 0 ? Math.round((todayVisitors - yesterdayVisitors) / yesterdayVisitors * 1000) / 10 : 0;
    const avgOccupancy = snapshots.length ? Math.round(snapshots.reduce((s, r) => s + (r.occupancy_percent || 0), 0) / snapshots.length * 10) / 10 : 0;

    // Queue ortalama bekleme
    const queueMatch = { date: { $gte: start, $lte: end } };
    if (storeIds) queueMatch.store_id = { $in: storeIds };
    const queueSnaps = await db.collection('queue_snapshots').find(queueMatch, { projection: { _id: 0 } }).toArray();
    const avgWait = queueSnaps.length ? Math.round(queueSnaps.reduce((s, r) => s + (r.avg_wait_time_seconds || 0), 0) / queueSnaps.length / 60 * 10) / 10 : 0;

    // En iyi mağaza
    const storeInMap = {};
    for (const s of snapshots) {
      if (!storeInMap[s.store_id] || s.total_in > storeInMap[s.store_id].total_in) storeInMap[s.store_id] = s;
    }
    const topStore = Object.values(storeInMap).sort((a, b) => (b.total_in || 0) - (a.total_in || 0))[0];

    res.json({
      generated_at: new Date().toISOString(),
      date_from: start, date_to: end,
      quick_stats: {
        total_stores: totalStores,
        today_visitors: todayVisitors,
        visitor_change_percent: visitorChange,
        avg_occupancy: avgOccupancy,
        avg_wait_time_min: avgWait
      },
      top_performers: {
        highest_traffic: topStore?.store_name || 'N/A',
        highest_traffic_count: topStore?.total_in || 0
      }
    });
  } catch (e) { res.status(500).json({ detail: e.message }); }
});

// 2. GET /api/analytics/hourly-traffic
router.get('/hourly-traffic', requireAuth, async (req, res) => {
  try {
    const db = getDB();
    const { store_id, date_from, date_to } = req.query;
    const { start, end } = getDateRange(date_from, date_to, 'week');
    const storeIds = store_id ? [store_id] : null;
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
        hour: h, hour_label: `${String(h).padStart(2,'0')}:00`,
        in_count: Math.round(r.avg_in || 0),    // frontend in_count bekliyor
        out_count: Math.round(r.avg_out || 0),  // frontend out_count bekliyor
        avg_in: Math.round(r.avg_in || 0),
        avg_out: Math.round(r.avg_out || 0),
        avg_visitors: Math.round(r.avg_visitors || 0), max_visitors: r.max_visitors || 0,
        is_peak: false
      };
    });

    const maxVisitors = Math.max(...hourly.map(h => h.avg_visitors));
    if (maxVisitors > 0) {
      const threshold = maxVisitors * 0.8;
      hourly.forEach(h => { h.is_peak = h.avg_visitors >= threshold; });
    }

    const peakHourObj = hourly.reduce((max, h) => h.avg_visitors > max.avg_visitors ? h : max, hourly[0]);
    const totalIn = hourly.reduce((s, h) => s + h.avg_in, 0);

    res.json({
      hourly_data: hourly,
      peak_hour: peakHourObj?.hour_label || '00:00',  // string — React direkt render edebilir
      peak_hour_data: peakHourObj,
      total_in: Math.round(totalIn),
      date_from: start, date_to: end
    });
  } catch (e) { res.status(500).json({ detail: e.message }); }
});

// 3. GET /api/analytics/trends
router.get('/trends', requireAuth, async (req, res) => {
  try {
    const db = getDB();
    const { store_id, date_from, date_to, period = 'week' } = req.query;
    const { start, end } = getDateRange(date_from, date_to, period);
    const storeIds = store_id ? [store_id] : null;
    const match = { date: { $gte: start, $lte: end } };
    if (storeIds) match.store_id = { $in: storeIds };

    const pipeline = [
      { $match: match },
      { $group: { _id: '$date', total_in: { $sum: '$total_in' }, avg_visitors: { $avg: '$current_visitors' } } },
      { $sort: { _id: 1 } }
    ];
    const daily = await db.collection('counter_snapshots').aggregate(pipeline).toArray();

    // Frontend hem in_count hem total_in bekliyor
    const trendList = daily.map(d => ({
      date: d._id,
      in_count: d.total_in || 0,        // frontend dataKey="in_count" bekliyor
      total_in: d.total_in || 0,
      avg_visitors: Math.round(d.avg_visitors || 0)
    }));
    const totalAll = trendList.reduce((s, d) => s + d.in_count, 0);
    const avgDaily = trendList.length > 0 ? Math.round(totalAll / trendList.length) : 0;

    const half = Math.floor(trendList.length / 2);
    const firstHalf = trendList.slice(0, half).reduce((s, d) => s + d.in_count, 0);
    const secondHalf = trendList.slice(half).reduce((s, d) => s + d.in_count, 0);
    const weekChange = firstHalf > 0 ? Math.round((secondHalf - firstHalf) / firstHalf * 1000) / 10 : 0;

    res.json({
      daily_data: trendList,         // frontend daily_data bekliyor
      trend_data: trendList,         // eski isim — geriye dönük uyumluluk
      week_over_week_change: weekChange,
      average_daily: avgDaily,
      date_from: start, date_to: end
    });
  } catch (e) { res.status(500).json({ detail: e.message }); }
});

// 4. GET /api/analytics/comparison
router.get('/comparison', requireAuth, async (req, res) => {
  try {
    const db = getDB();
    const { store_id, date_from, date_to } = req.query;
    const { start, end } = getDateRange(date_from, date_to, 'week');
    const storeIds = store_id ? [store_id] : null;

    const days = (new Date(end) - new Date(start)) / 86400000 + 1;
    const prevEnd = new Date(new Date(start) - 86400000).toISOString().split('T')[0];
    const prevStart = new Date(new Date(start) - days * 86400000).toISOString().split('T')[0];

    async function getPeriodTotal(s, e) {
      const match = { date: { $gte: s, $lte: e } };
      if (storeIds) match.store_id = { $in: storeIds };
      const r = await db.collection('counter_snapshots').aggregate([
        { $match: match }, { $group: { _id: null, total: { $sum: '$total_in' } } }
      ]).toArray();
      return r[0]?.total || 0;
    }

    const [current, previous] = await Promise.all([getPeriodTotal(start, end), getPeriodTotal(prevStart, prevEnd)]);
    const change = previous > 0 ? Math.round((current - previous) / previous * 1000) / 10 : 0;

    res.json({ current_period: { total_in: current, date_from: start, date_to: end }, previous_period: { total_in: previous, date_from: prevStart, date_to: prevEnd }, change_percent: change });
  } catch (e) { res.status(500).json({ detail: e.message }); }
});

// 5. GET /api/analytics/demographics
router.get('/demographics', requireAuth, async (req, res) => {
  try {
    const db = getDB();
    const { store_id, date_from, date_to } = req.query;
    const { start, end } = getDateRange(date_from, date_to, 'week');
    const storeIds = store_id ? [store_id] : null;
    const match = { date: { $gte: start, $lte: end } };
    if (storeIds) match.store_id = { $in: storeIds };

    const snaps = await db.collection('analytics_snapshots').find(match, { projection: { _id: 0 } }).toArray();
    const gender = { Male: 0, Female: 0, Unknown: 0 };
    const age = { '0-17': 0, '18-24': 0, '25-34': 0, '35-44': 0, '45-54': 0, '55+': 0 };
    let total = 0;
    for (const s of snaps) {
      total += s.total_events || 0;
      for (const [k, v] of Object.entries(s.gender_distribution || {})) if (gender[k] !== undefined) gender[k] += v;
      for (const [k, v] of Object.entries(s.age_distribution || {})) if (age[k] !== undefined) age[k] += v;
    }
    res.json({ total_events: total, gender_distribution: gender, age_distribution: age, date_from: start, date_to: end });
  } catch (e) { res.status(500).json({ detail: e.message }); }
});

// 6. GET /api/analytics/store-comparison
router.get('/store-comparison', requireAuth, async (req, res) => {
  try {
    const db = getDB();
    const { date_from, date_to } = req.query;
    const { start, end } = getDateRange(date_from, date_to, 'week');
    const pipeline = [
      { $match: { date: { $gte: start, $lte: end } } },
      { $group: { _id: '$store_id', store_name: { $first: '$store_name' }, total_in: { $sum: '$total_in' }, avg_visitors: { $avg: '$current_visitors' }, avg_occupancy: { $avg: '$occupancy_percent' } } },
      { $sort: { total_in: -1 } }
    ];
    const results = await db.collection('counter_snapshots').aggregate(pipeline).toArray();
    const stores = results.map(r => ({
      store_id: r._id, store_name: r.store_name,
      total_in: r.total_in || 0,
      avg_visitors: Math.round(r.avg_visitors || 0),
      avg_occupancy: Math.round((r.avg_occupancy || 0) * 10) / 10,
      avg_queue_length: 0
    }));
    const top = stores[0];
    res.json({
      stores,
      top_performer: top ? { store_name: top.store_name, total_in: top.total_in, avg_occupancy: top.avg_occupancy, avg_queue_length: 0 } : null,
      date_from: start, date_to: end
    });
  } catch (e) { res.status(500).json({ detail: e.message }); }
});

// 7. GET /api/analytics/region-analysis
router.get('/region-analysis', requireAuth, async (req, res) => {
  try {
    const db = getDB();
    const { date_from, date_to } = req.query;
    const { start, end } = getDateRange(date_from, date_to, 'week');

    const [regions, cities, districts, stores] = await Promise.all([
      db.collection('regions').find({}, { projection: { _id: 0 } }).toArray(),
      db.collection('cities').find({}, { projection: { _id: 0 } }).toArray(),
      db.collection('districts').find({}, { projection: { _id: 0 } }).toArray(),
      db.collection('stores').find({}, { projection: { _id: 0 } }).toArray()
    ]);

    const distMap = Object.fromEntries(districts.map(d => [d.id, d]));
    const cityMap = Object.fromEntries(cities.map(c => [c.id, c]));
    const storeRegionMap = {};
    for (const s of stores) {
      const dist = distMap[s.district_id] || {};
      const city = cityMap[dist.city_id] || {};
      storeRegionMap[s.id] = city.region_id || '';
    }

    const snaps = await db.collection('counter_snapshots').find({ date: { $gte: start, $lte: end } }, { projection: { _id: 0 } }).toArray();
    const regionData = {};
    for (const snap of snaps) {
      const regionId = storeRegionMap[snap.store_id] || 'unknown';
      if (!regionData[regionId]) regionData[regionId] = { region_id: regionId, total_in: 0, store_count: new Set() };
      regionData[regionId].total_in += snap.total_in || 0;
      regionData[regionId].store_count.add(snap.store_id);
    }

    const regionList = regions.map(r => ({
      region_id: r.id, region_name: r.name,
      total_in: regionData[r.id]?.total_in || 0,
      store_count: regionData[r.id]?.store_count.size || 0
    })).sort((a, b) => b.total_in - a.total_in);

    res.json({ regions: regionList, date_from: start, date_to: end });
  } catch (e) { res.status(500).json({ detail: e.message }); }
});

// 8. GET /api/analytics/capacity-utilization
router.get('/capacity-utilization', requireAuth, async (req, res) => {
  try {
    const db = getDB();
    const { store_id, date_from, date_to } = req.query;
    const { start, end } = getDateRange(date_from, date_to, 'week');
    const storeIds = store_id ? [store_id] : null;
    const match = { date: { $gte: start, $lte: end } };
    if (storeIds) match.store_id = { $in: storeIds };

    const pipeline = [
      { $match: match },
      { $group: { _id: '$store_id', store_name: { $first: '$store_name' }, avg_occupancy: { $avg: '$occupancy_percent' }, max_occupancy: { $max: '$occupancy_percent' }, capacity: { $first: '$capacity' } } }
    ];
    const results = await db.collection('counter_snapshots').aggregate(pipeline).toArray();
    const stores = results.map(r => ({
      store_id: r._id, store_name: r.store_name,
      avg_occupancy: Math.round((r.avg_occupancy || 0) * 10) / 10,
      max_occupancy: Math.round((r.max_occupancy || 0) * 10) / 10,
      capacity: r.capacity || 100
    }));

    const optimal = stores.filter(s => s.avg_occupancy >= 40 && s.avg_occupancy < 80).length;
    const underUtilized = stores.filter(s => s.avg_occupancy < 40).length;
    const overCapacity = stores.filter(s => s.avg_occupancy >= 80).length;

    res.json({
      stores,
      distribution: {          // frontend distribution.optimal vb. bekliyor
        optimal,
        under_utilized: underUtilized,
        over_capacity: overCapacity
      },
      overall_avg_occupancy: stores.length ? Math.round(stores.reduce((s, r) => s + r.avg_occupancy, 0) / stores.length * 10) / 10 : 0,
      date_from: start, date_to: end
    });
  } catch (e) { res.status(500).json({ detail: e.message }); }
});

// 9. GET /api/analytics/forecast
router.get('/forecast', requireAuth, async (req, res) => {
  try {
    const db = getDB();
    const { store_id, date_from, date_to } = req.query;
    const { start, end } = getDateRange(date_from, date_to, 'week');
    const storeIds = store_id ? [store_id] : null;
    const match = { date: { $gte: start, $lte: end } };
    if (storeIds) match.store_id = { $in: storeIds };

    // Gün bazında ortalama trafik — basit tahmin
    const pipeline = [
      { $match: match },
      { $group: { _id: '$date', avg_in: { $avg: '$total_in' } } },
      { $sort: { _id: 1 } }
    ];
    const dailyData = await db.collection('counter_snapshots').aggregate(pipeline).toArray();
    const avg = dailyData.length ? dailyData.reduce((s, d) => s + (d.avg_in || 0), 0) / dailyData.length : 0;

    // Gelecek 7 gün tahmini
    const daily_forecast = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(Date.now() + (i + 1) * 86400000).toISOString().split('T')[0];
      const predicted = Math.round(avg * (0.85 + Math.random() * 0.3));
      return { date, predicted_visitors: predicted, visitors: predicted };
    });

    res.json({
      daily_forecast,       // frontend daily_forecast bekliyor
      forecast: daily_forecast,  // geriye dönük uyumluluk
      avg_daily: Math.round(avg),
      date_from: start, date_to: end
    });
  } catch (e) { res.status(500).json({ detail: e.message }); }
});

// 10. GET /api/analytics/peak-alerts
router.get('/peak-alerts', requireAuth, async (req, res) => {
  try {
    const db = getDB();
    const today = new Date().toISOString().split('T')[0];
    const snaps = await db.collection('counter_snapshots').find({ date: today }, { projection: { _id: 0 } }).toArray();
    // Saatlik yoğunluğa göre peak period'lar oluştur
    const hourPipeline = [
      { $match: { date: today } },
      { $group: { _id: '$hour', avg_occupancy: { $avg: '$occupancy_percent' }, store_name: { $first: '$store_name' } } },
      { $sort: { avg_occupancy: -1 } }, { $limit: 3 }
    ];
    const peakHours = await db.collection('counter_snapshots').aggregate(hourPipeline).toArray();

    const peakPeriods = peakHours
      .filter(h => (h.avg_occupancy || 0) >= 50)
      .map(h => ({
        alert_level: h.avg_occupancy >= 90 ? 'high' : h.avg_occupancy >= 70 ? 'medium' : 'low',
        period: `${String(h._id).padStart(2,'0')}:00`,
        start_time: `${String(h._id).padStart(2,'0')}:00`,
        end_time: `${String(h._id + 1).padStart(2,'0')}:00`,
        expected_capacity_percent: Math.round(h.avg_occupancy || 0)
      }));

    const alerts = [];
    for (const snap of snaps) {
      if ((snap.occupancy_percent || 0) >= 70) {
        alerts.push({ level: snap.occupancy_percent >= 90 ? 'high' : 'medium', store_name: snap.store_name, title: 'Yüksek Doluluk', description: `%${snap.occupancy_percent} doluluk`, time: snap.timestamp });
      }
    }
    res.json({ alerts, peak_periods: peakPeriods, total_alerts: alerts.length });
  } catch (e) { res.status(500).json({ detail: e.message }); }
});

// 11. GET /api/analytics/queue-analytics
router.get('/queue-analytics', requireAuth, async (req, res) => {
  try {
    const db = getDB();
    const { store_id, date_from, date_to } = req.query;
    const { start, end } = getDateRange(date_from, date_to, 'week');
    const storeIds = store_id ? [store_id] : null;
    const match = { date: { $gte: start, $lte: end } };
    if (storeIds) match.store_id = { $in: storeIds };

    const pipeline = [
      { $match: match },
      { $group: { _id: '$store_id', store_name: { $first: '$store_name' }, avg_queue: { $avg: '$total_queue_length' }, max_queue: { $max: '$total_queue_length' }, avg_wait: { $avg: '$avg_wait_time_seconds' } } }
    ];
    const results = await db.collection('queue_snapshots').aggregate(pipeline).toArray();
    const stores = await db.collection('stores').find({}, { projection: { _id: 0, id: 1, queue_threshold: 1 } }).toArray();
    const threshMap = Object.fromEntries(stores.map(s => [s.id, s.queue_threshold || 5]));

    const storeList = results.map(r => ({
      store_id: r._id, store_name: r.store_name,
      avg_queue_length: Math.round((r.avg_queue || 0) * 10) / 10,
      max_queue_length: r.max_queue || 0,
      avg_wait_minutes: Math.round((r.avg_wait || 0) / 60 * 10) / 10,
      queue_threshold: threshMap[r._id] || 5
    }));

    res.json({ stores: storeList, total_stores: storeList.length, date_from: start, date_to: end });
  } catch (e) { res.status(500).json({ detail: e.message }); }
});

module.exports = router;
