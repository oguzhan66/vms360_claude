const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const db = getDB();
  const query = req.query.store_id ? { store_id: req.query.store_id } : {};
  const floors = await db.collection('floors').find(query, { projection: { _id: 0 } }).toArray();
  res.json(floors);
});

router.get('/:id', requireAuth, async (req, res) => {
  const db = getDB();
  const floor = await db.collection('floors').findOne({ id: req.params.id }, { projection: { _id: 0 } });
  if (!floor) return res.status(404).json({ detail: 'Kat planı bulunamadı' });
  res.json(floor);
});

router.post('/', requireAdmin, async (req, res) => {
  const db = getDB();
  const doc = { id: uuidv4(), created_at: new Date().toISOString(), cameras: [], zones: [], ...req.body };
  await db.collection('floors').insertOne(doc);
  const { _id, ...out } = doc;
  res.json(out);
});

router.put('/:id', requireAdmin, async (req, res) => {
  const db = getDB();
  const result = await db.collection('floors').updateOne({ id: req.params.id }, { $set: req.body });
  if (result.matchedCount === 0) return res.status(404).json({ detail: 'Kat planı bulunamadı' });
  const updated = await db.collection('floors').findOne({ id: req.params.id }, { projection: { _id: 0 } });
  res.json(updated);
});

router.delete('/:id', requireAdmin, async (req, res) => {
  const db = getDB();
  const result = await db.collection('floors').deleteOne({ id: req.params.id });
  if (result.deletedCount === 0) return res.status(404).json({ detail: 'Kat planı bulunamadı' });
  res.json({ status: 'deleted' });
});

router.post('/:id/upload-plan', requireAdmin, async (req, res) => {
  res.json({ message: 'Plan yükleme özelliği yakında' });
});

router.get('/:id/cameras', requireAuth, async (req, res) => {
  const db = getDB();
  const floor = await db.collection('floors').findOne({ id: req.params.id }, { projection: { _id: 0 } });
  if (!floor) return res.status(404).json({ detail: 'Kat planı bulunamadı' });
  res.json(floor.cameras || []);
});

router.get('/:id/available-cameras', requireAuth, async (req, res) => {
  const db = getDB();
  const floor = await db.collection('floors').findOne({ id: req.params.id }, { projection: { _id: 0 } });
  if (!floor) return res.status(404).json({ detail: 'Kat planı bulunamadı' });
  const cameras = await db.collection('cameras').find({ store_id: floor.store_id }, { projection: { _id: 0 } }).toArray();
  res.json(cameras);
});

router.put('/:floorId/cameras/:cameraId/position', requireAdmin, async (req, res) => {
  const db = getDB();
  const { x, y } = req.body;
  await db.collection('floors').updateOne(
    { id: req.params.floorId, 'cameras.camera_id': req.params.cameraId },
    { $set: { 'cameras.$.x': x, 'cameras.$.y': y } }
  );
  await db.collection('floors').updateOne(
    { id: req.params.floorId, 'cameras.camera_id': { $ne: req.params.cameraId } },
    { $push: { cameras: { camera_id: req.params.cameraId, x, y } } }
  );
  res.json({ status: 'ok' });
});

router.delete('/:floorId/cameras/:cameraId/position', requireAdmin, async (req, res) => {
  const db = getDB();
  await db.collection('floors').updateOne({ id: req.params.floorId }, { $pull: { cameras: { camera_id: req.params.cameraId } } });
  res.json({ status: 'ok' });
});

router.get('/:id/zones', requireAuth, async (req, res) => {
  const db = getDB();
  const floor = await db.collection('floors').findOne({ id: req.params.id }, { projection: { _id: 0 } });
  res.json(floor?.zones || []);
});

router.post('/:id/zones', requireAdmin, async (req, res) => {
  const db = getDB();
  const zone = { id: uuidv4(), ...req.body };
  await db.collection('floors').updateOne({ id: req.params.id }, { $push: { zones: zone } });
  res.json(zone);
});

router.put('/:floorId/zones/:zoneId', requireAdmin, async (req, res) => {
  const db = getDB();
  const floor = await db.collection('floors').findOne({ id: req.params.floorId });
  if (!floor) return res.status(404).json({ detail: 'Bulunamadı' });
  const zones = (floor.zones || []).map(z => z.id === req.params.zoneId ? { ...z, ...req.body } : z);
  await db.collection('floors').updateOne({ id: req.params.floorId }, { $set: { zones } });
  res.json(zones.find(z => z.id === req.params.zoneId));
});

router.delete('/:floorId/zones/:zoneId', requireAdmin, async (req, res) => {
  const db = getDB();
  await db.collection('floors').updateOne({ id: req.params.floorId }, { $pull: { zones: { id: req.params.zoneId } } });
  res.json({ status: 'deleted' });
});

module.exports = router;
