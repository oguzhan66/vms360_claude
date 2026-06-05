const express = require('express');
const bcrypt = require('bcryptjs');
const { getDB } = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/users
router.get('/', requireAdmin, async (req, res) => {
  const db = getDB();
  const users = await db.collection('users').find({}, { projection: { _id: 0, password_hash: 0 } }).toArray();
  res.json(users);
});

// DELETE /api/users/:id
router.delete('/:id', requireAdmin, async (req, res) => {
  const db = getDB();
  const result = await db.collection('users').deleteOne({ id: req.params.id });
  if (result.deletedCount === 0) return res.status(404).json({ detail: 'Kullanıcı bulunamadı' });
  res.json({ message: 'Kullanıcı silindi' });
});

// PUT /api/users/:id/toggle
router.put('/:id/toggle', requireAdmin, async (req, res) => {
  const db = getDB();
  const user = await db.collection('users').findOne({ id: req.params.id });
  if (!user) return res.status(404).json({ detail: 'Kullanıcı bulunamadı' });
  const newStatus = !user.is_active;
  await db.collection('users').updateOne({ id: req.params.id }, { $set: { is_active: newStatus } });
  res.json({ message: 'Durum güncellendi', is_active: newStatus });
});

// PUT /api/users/:id
router.put('/:id', requireAdmin, async (req, res) => {
  const db = getDB();
  const user = await db.collection('users').findOne({ id: req.params.id });
  if (!user) return res.status(404).json({ detail: 'Kullanıcı bulunamadı' });

  const { full_name, role, password, allowed_region_ids, allowed_city_ids, allowed_store_ids } = req.body;
  const update = {};
  if (full_name !== undefined) update.full_name = full_name;
  if (role !== undefined) update.role = role;
  if (password !== undefined) update.password_hash = bcrypt.hashSync(password, 10);
  if (allowed_region_ids !== undefined) update.allowed_region_ids = allowed_region_ids;
  if (allowed_city_ids !== undefined) update.allowed_city_ids = allowed_city_ids;
  if (allowed_store_ids !== undefined) update.allowed_store_ids = allowed_store_ids;

  if (Object.keys(update).length > 0) {
    await db.collection('users').updateOne({ id: req.params.id }, { $set: update });
  }
  const updated = await db.collection('users').findOne({ id: req.params.id }, { projection: { _id: 0, password_hash: 0 } });
  res.json(updated);
});

module.exports = router;
