const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/', requireAuth, async (req, res) => {
  const db = getDB();
  const doc = { id: uuidv4(), is_active: true, created_at: new Date().toISOString(), type: 'counter', ...req.body };
  await db.collection('cameras').insertOne(doc);
  const { _id, ...out } = doc;
  res.json(out);
});

router.get('/', requireAuth, async (req, res) => {
  const db = getDB();
  const query = req.query.store_id ? { store_id: req.query.store_id } : {};
  const cameras = await db.collection('cameras').find(query, { projection: { _id: 0 } }).toArray();
  res.json(cameras);
});

router.delete('/:id', requireAuth, async (req, res) => {
  const db = getDB();
  const result = await db.collection('cameras').deleteOne({ id: req.params.id });
  if (result.deletedCount === 0) return res.status(404).json({ detail: 'Kamera bulunamadı' });
  res.json({ status: 'deleted' });
});

router.patch('/:id/status', requireAuth, async (req, res) => {
  const db = getDB();
  const is_active = req.query.is_active === 'true';
  const result = await db.collection('cameras').updateOne({ id: req.params.id }, { $set: { is_active } });
  if (result.matchedCount === 0) return res.status(404).json({ detail: 'Kamera bulunamadı' });
  res.json({ status: 'success', message: `Kamera ${is_active ? 'aktif' : 'pasif'} yapıldı` });
});

router.post('/bulk-delete', requireAuth, async (req, res) => {
  const db = getDB();
  const { camera_ids } = req.body;
  if (!camera_ids || !camera_ids.length) return res.status(400).json({ detail: 'Kamera ID gerekli' });
  const result = await db.collection('cameras').deleteMany({ id: { $in: camera_ids } });
  await db.collection('stores').updateMany({}, {
    $pull: {
      counter_camera_ids: { $in: camera_ids },
      queue_camera_ids: { $in: camera_ids },
      analytics_camera_ids: { $in: camera_ids }
    }
  });
  res.json({ status: 'success', deleted_count: result.deletedCount, message: `${result.deletedCount} kamera silindi` });
});

router.post('/bulk-status', requireAuth, async (req, res) => {
  const db = getDB();
  const { camera_ids, is_active } = req.body;
  if (!camera_ids || !camera_ids.length) return res.status(400).json({ detail: 'Kamera ID gerekli' });
  const result = await db.collection('cameras').updateMany({ id: { $in: camera_ids } }, { $set: { is_active } });
  res.json({ status: 'success', updated_count: result.modifiedCount, message: `${result.modifiedCount} kamera ${is_active ? 'aktif' : 'pasif'} yapıldı` });
});

module.exports = router;
