const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/', requireAuth, async (req, res) => {
  const db = getDB();
  const doc = { id: uuidv4(), created_at: new Date().toISOString(), counter_camera_ids: [], queue_camera_ids: [], analytics_camera_ids: [], capacity: 100, queue_threshold: 5, ...req.body };
  await db.collection('stores').insertOne(doc);
  const { _id, ...out } = doc;
  res.json(out);
});

router.get('/', requireAuth, async (req, res) => {
  const db = getDB();
  const { region_id, city_id, district_id } = req.query;
  let query = {};

  if (district_id) {
    query.district_id = district_id;
  } else if (city_id) {
    const districts = await db.collection('districts').find({ city_id }, { projection: { _id: 0 } }).toArray();
    const ids = districts.map(d => d.id);
    if (ids.length) query.district_id = { $in: ids };
  } else if (region_id) {
    const cities = await db.collection('cities').find({ region_id }, { projection: { _id: 0 } }).toArray();
    const cityIds = cities.map(c => c.id);
    const districts = await db.collection('districts').find({ city_id: { $in: cityIds } }, { projection: { _id: 0 } }).toArray();
    const ids = districts.map(d => d.id);
    if (ids.length) query.district_id = { $in: ids };
  }

  const stores = await db.collection('stores').find(query, { projection: { _id: 0 } }).toArray();
  res.json(stores);
});

router.get('/:id', requireAuth, async (req, res) => {
  const db = getDB();
  const store = await db.collection('stores').findOne({ id: req.params.id }, { projection: { _id: 0 } });
  if (!store) return res.status(404).json({ detail: 'Store bulunamadı' });
  res.json(store);
});

router.put('/:id', requireAuth, async (req, res) => {
  const db = getDB();
  const update = Object.fromEntries(Object.entries(req.body).filter(([, v]) => v !== undefined && v !== null));
  if (!Object.keys(update).length) return res.status(400).json({ detail: 'Güncellenecek veri yok' });
  const result = await db.collection('stores').updateOne({ id: req.params.id }, { $set: update });
  if (result.matchedCount === 0) return res.status(404).json({ detail: 'Store bulunamadı' });
  const updated = await db.collection('stores').findOne({ id: req.params.id }, { projection: { _id: 0 } });
  res.json(updated);
});

router.delete('/:id', requireAuth, async (req, res) => {
  const db = getDB();
  const result = await db.collection('stores').deleteOne({ id: req.params.id });
  if (result.deletedCount === 0) return res.status(404).json({ detail: 'Store bulunamadı' });
  res.json({ status: 'deleted' });
});

module.exports = router;
