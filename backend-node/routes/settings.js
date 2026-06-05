const express = require('express');
const { getDB } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const DEFAULTS = {
  id: 'global_settings',
  refresh_interval: 30,
  capacity_warning_percent: 80,
  capacity_critical_percent: 95,
  email_notifications: false,
  notification_email: null
};

router.get('/', requireAuth, async (req, res) => {
  const db = getDB();
  let settings = await db.collection('settings').findOne({ id: 'global_settings' }, { projection: { _id: 0 } });
  if (!settings) {
    await db.collection('settings').insertOne({ ...DEFAULTS });
    settings = { ...DEFAULTS };
  }
  res.json(settings);
});

router.put('/', requireAuth, async (req, res) => {
  const db = getDB();
  const data = { ...DEFAULTS, ...req.body, id: 'global_settings' };
  await db.collection('settings').updateOne({ id: 'global_settings' }, { $set: data }, { upsert: true });
  res.json(data);
});

module.exports = router;
