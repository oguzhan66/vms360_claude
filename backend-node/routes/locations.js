const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// REGIONS
router.post('/regions', requireAuth, async (req, res) => {
  const db = getDB();
  const doc = { id: uuidv4(), name: req.body.name, created_at: new Date().toISOString() };
  await db.collection('regions').insertOne(doc);
  const { _id, ...out } = doc;
  res.json(out);
});

router.get('/regions', requireAuth, async (req, res) => {
  const db = getDB();
  const regions = await db.collection('regions').find({}, { projection: { _id: 0 } }).toArray();
  res.json(regions);
});

router.delete('/regions/:id', requireAuth, async (req, res) => {
  const db = getDB();
  const result = await db.collection('regions').deleteOne({ id: req.params.id });
  if (result.deletedCount === 0) return res.status(404).json({ detail: 'Region bulunamadı' });
  res.json({ status: 'deleted' });
});

// CITIES
router.post('/cities', requireAuth, async (req, res) => {
  const { name, parent_id } = req.body;
  if (!parent_id) return res.status(400).json({ detail: 'parent_id (region_id) gerekli' });
  const db = getDB();
  const doc = { id: uuidv4(), name, region_id: parent_id, created_at: new Date().toISOString() };
  await db.collection('cities').insertOne(doc);
  const { _id, ...out } = doc;
  res.json(out);
});

router.get('/cities', requireAuth, async (req, res) => {
  const db = getDB();
  const query = req.query.region_id ? { region_id: req.query.region_id } : {};
  const cities = await db.collection('cities').find(query, { projection: { _id: 0 } }).toArray();
  res.json(cities);
});

router.delete('/cities/:id', requireAuth, async (req, res) => {
  const db = getDB();
  const result = await db.collection('cities').deleteOne({ id: req.params.id });
  if (result.deletedCount === 0) return res.status(404).json({ detail: 'City bulunamadı' });
  res.json({ status: 'deleted' });
});

// DISTRICTS
router.post('/districts', requireAuth, async (req, res) => {
  const { name, parent_id } = req.body;
  if (!parent_id) return res.status(400).json({ detail: 'parent_id (city_id) gerekli' });
  const db = getDB();
  const doc = { id: uuidv4(), name, city_id: parent_id, created_at: new Date().toISOString() };
  await db.collection('districts').insertOne(doc);
  const { _id, ...out } = doc;
  res.json(out);
});

router.get('/districts', requireAuth, async (req, res) => {
  const db = getDB();
  const query = req.query.city_id ? { city_id: req.query.city_id } : {};
  const districts = await db.collection('districts').find(query, { projection: { _id: 0 } }).toArray();
  res.json(districts);
});

router.delete('/districts/:id', requireAuth, async (req, res) => {
  const db = getDB();
  const result = await db.collection('districts').deleteOne({ id: req.params.id });
  if (result.deletedCount === 0) return res.status(404).json({ detail: 'District bulunamadı' });
  res.json({ status: 'deleted' });
});

// HIERARCHY
router.get('/hierarchy', requireAuth, async (req, res) => {
  const db = getDB();
  const [regions, cities, districts, stores] = await Promise.all([
    db.collection('regions').find({}, { projection: { _id: 0 } }).toArray(),
    db.collection('cities').find({}, { projection: { _id: 0 } }).toArray(),
    db.collection('districts').find({}, { projection: { _id: 0 } }).toArray(),
    db.collection('stores').find({}, { projection: { _id: 0 } }).toArray(),
  ]);

  const hierarchy = regions.map(region => ({
    id: region.id, name: region.name, type: 'region',
    cities: cities.filter(c => c.region_id === region.id).map(city => ({
      id: city.id, name: city.name, type: 'city',
      districts: districts.filter(d => d.city_id === city.id).map(district => ({
        id: district.id, name: district.name, type: 'district',
        store_count: stores.filter(s => s.district_id === district.id).length
      }))
    }))
  }));

  res.json({ hierarchy });
});

module.exports = router;
