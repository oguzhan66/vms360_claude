const express = require('express');
const { getDB } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/stores', requireAuth, async (req, res) => {
  const db = getDB();
  const stores = await db.collection('stores').find({}, { projection: { _id: 0 } }).toArray();
  const threshold = 30 * 60 * 1000; // 30 dakika
  const now = Date.now();

  const health = await Promise.all(stores.map(async store => {
    const last = await db.collection('counter_snapshots').findOne(
      { store_id: store.id },
      { sort: { timestamp: -1 }, projection: { _id: 0, timestamp: 1 } }
    );
    const lastAt = last?.timestamp ? new Date(last.timestamp).getTime() : 0;
    const isOnline = lastAt > 0 && (now - lastAt) < threshold;
    return {
      store_id: store.id, store_name: store.name,
      status: isOnline ? 'online' : 'offline',
      last_data: last?.timestamp || null,
      minutes_ago: lastAt > 0 ? Math.round((now - lastAt) / 60000) : null
    };
  }));

  res.json(health);
});

module.exports = router;
