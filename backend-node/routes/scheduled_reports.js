const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const db = getDB();
  const reports = await db.collection('scheduled_reports').find({}, { projection: { _id: 0 } }).toArray();
  res.json(reports);
});

router.post('/', requireAdmin, async (req, res) => {
  const db = getDB();
  const doc = { id: uuidv4(), is_active: true, created_at: new Date().toISOString(), ...req.body };
  await db.collection('scheduled_reports').insertOne(doc);
  const { _id, ...out } = doc;
  res.json(out);
});

router.put('/:id', requireAdmin, async (req, res) => {
  const db = getDB();
  const result = await db.collection('scheduled_reports').updateOne({ id: req.params.id }, { $set: req.body });
  if (result.matchedCount === 0) return res.status(404).json({ detail: 'Rapor bulunamadı' });
  const updated = await db.collection('scheduled_reports').findOne({ id: req.params.id }, { projection: { _id: 0 } });
  res.json(updated);
});

router.delete('/:id', requireAdmin, async (req, res) => {
  const db = getDB();
  const result = await db.collection('scheduled_reports').deleteOne({ id: req.params.id });
  if (result.deletedCount === 0) return res.status(404).json({ detail: 'Rapor bulunamadı' });
  res.json({ message: 'Silindi' });
});

router.post('/:id/send-now', requireAdmin, async (req, res) => {
  res.json({ message: 'Rapor gönderme kuyruğa alındı' });
});

module.exports = router;
