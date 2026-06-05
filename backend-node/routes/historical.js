const express = require('express');
const { getDB } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/counter', requireAuth, async (req, res) => {
  const db = getDB();
  const { store_id, start_date, end_date } = req.query;
  const query = {};
  if (store_id) query.store_id = store_id;
  if (start_date || end_date) {
    query.date = {};
    if (start_date) query.date.$gte = start_date;
    if (end_date) query.date.$lte = end_date;
  }
  const data = await db.collection('historical_counter').find(query, { projection: { _id: 0 } }).sort({ date: -1, hour: -1 }).limit(1000).toArray();
  res.json(data);
});

router.get('/queue', requireAuth, async (req, res) => {
  const db = getDB();
  const { store_id, start_date, end_date } = req.query;
  const query = {};
  if (store_id) query.store_id = store_id;
  if (start_date || end_date) {
    query.date = {};
    if (start_date) query.date.$gte = start_date;
    if (end_date) query.date.$lte = end_date;
  }
  const data = await db.collection('historical_queue').find(query, { projection: { _id: 0 } }).sort({ date: -1, hour: -1 }).limit(1000).toArray();
  res.json(data);
});

router.get('/analytics', requireAuth, async (req, res) => {
  const db = getDB();
  const { start_date, end_date } = req.query;
  const query = {};
  if (start_date || end_date) {
    query.date = {};
    if (start_date) query.date.$gte = start_date;
    if (end_date) query.date.$lte = end_date;
  }
  const data = await db.collection('historical_analytics').find(query, { projection: { _id: 0 } }).sort({ date: -1, hour: -1 }).limit(1000).toArray();
  res.json(data);
});

router.get('/summary', requireAuth, async (req, res) => {
  const db = getDB();
  const now = new Date();
  const endDate = req.query.end_date || now.toISOString().split('T')[0];
  const startDate = req.query.start_date || new Date(now - 7 * 86400000).toISOString().split('T')[0];

  const query = { date: { $gte: startDate, $lte: endDate } };
  const [counterData, queueData, analyticsData] = await Promise.all([
    db.collection('historical_counter').find(query, { projection: { _id: 0 } }).toArray(),
    db.collection('historical_queue').find(query, { projection: { _id: 0 } }).toArray(),
    db.collection('historical_analytics').find(query, { projection: { _id: 0 } }).toArray()
  ]);

  const dailyStats = {};
  for (const r of counterData) {
    if (!dailyStats[r.date]) dailyStats[r.date] = { date: r.date, total_in: 0, total_out: 0, avg_visitors: 0, count: 0 };
    dailyStats[r.date].total_in += r.total_in || 0;
    dailyStats[r.date].total_out += r.total_out || 0;
    dailyStats[r.date].avg_visitors += r.current_visitors || 0;
    dailyStats[r.date].count++;
  }
  for (const s of Object.values(dailyStats)) {
    if (s.count > 0) s.avg_visitors = Math.round(s.avg_visitors / s.count * 10) / 10;
  }

  res.json({
    start_date: startDate, end_date: endDate,
    total_records: { counter: counterData.length, queue: queueData.length, analytics: analyticsData.length },
    daily_stats: Object.values(dailyStats),
    total_in: counterData.reduce((s, r) => s + (r.total_in || 0), 0),
    total_out: counterData.reduce((s, r) => s + (r.total_out || 0), 0)
  });
});

module.exports = router;
