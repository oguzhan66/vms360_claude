const express = require('express');
const { getDB } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/stores-with-floors', requireAuth, async (req, res) => {
  const db = getDB();
  const floors = await db.collection('floors').find({}, { projection: { _id: 0, id: 1, name: 1, store_id: 1 } }).toArray();
  const storeIds = [...new Set(floors.map(f => f.store_id))];
  const stores = await db.collection('stores').find({ id: { $in: storeIds } }, { projection: { _id: 0 } }).toArray();
  const result = stores.map(s => ({ ...s, floors: floors.filter(f => f.store_id === s.id) }));
  res.json(result);
});

router.get('/live/:floorId', requireAuth, async (req, res) => {
  const db = getDB();
  const floor = await db.collection('floors').findOne({ id: req.params.floorId }, { projection: { _id: 0 } });
  if (!floor) return res.status(404).json({ detail: 'Kat planı bulunamadı' });

  const cameras = await db.collection('cameras').find({ store_id: floor.store_id }, { projection: { _id: 0 } }).toArray();
  const camIds = cameras.map(c => c.id);

  // Son counter snapshot'tan kamera verilerini al
  const snapshot = await db.collection('counter_snapshots').findOne(
    { store_id: floor.store_id },
    { sort: { timestamp: -1 }, projection: { _id: 0 } }
  );

  const heatmapPoints = (floor.cameras || []).map(fc => {
    const cam = cameras.find(c => c.id === fc.camera_id || c.camera_vms_id === fc.camera_id);
    const detail = snapshot?.camera_details?.find(d => d.camera_id === fc.camera_id);
    return { camera_id: fc.camera_id, x: fc.x || 0, y: fc.y || 0, intensity: detail ? (detail.in_count || 0) : 0, camera_name: cam?.name || fc.camera_id };
  });

  res.json({ floor_id: req.params.floorId, floor_name: floor.name, heatmap_points: heatmapPoints, timestamp: snapshot?.timestamp || new Date().toISOString() });
});

router.get('/range/:floorId', requireAuth, async (req, res) => {
  const db = getDB();
  const { date_from, date_to } = req.query;
  const floor = await db.collection('floors').findOne({ id: req.params.floorId }, { projection: { _id: 0 } });
  if (!floor) return res.status(404).json({ detail: 'Kat planı bulunamadı' });

  const today = new Date().toISOString().split('T')[0];
  const start = date_from || today;
  const end = date_to || today;

  const pipeline = [
    { $match: { store_id: floor.store_id, date: { $gte: start, $lte: end } } },
    { $unwind: { path: '$camera_details', preserveNullAndEmptyArrays: true } },
    { $group: { _id: '$camera_details.camera_id', total_in: { $sum: '$camera_details.in_count' } } }
  ];

  const results = await db.collection('counter_snapshots').aggregate(pipeline).toArray();
  const heatmapPoints = (floor.cameras || []).map(fc => {
    const r = results.find(x => x._id === fc.camera_id);
    return { camera_id: fc.camera_id, x: fc.x || 0, y: fc.y || 0, intensity: r?.total_in || 0 };
  });

  res.json({ floor_id: req.params.floorId, floor_name: floor.name, heatmap_points: heatmapPoints, start_date: start, end_date: end });
});

router.post('/export/pdf', requireAuth, async (req, res) => {
  res.json({ message: 'PDF export yakında' });
});

module.exports = router;
