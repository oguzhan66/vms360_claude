const express = require('express');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/smtp', requireAdmin, async (req, res) => {
  const db = getDB();
  const settings = await db.collection('smtp_settings').findOne({}, { projection: { _id: 0, password: 0 } });
  res.json(settings || null);
});

router.post('/smtp', requireAdmin, async (req, res) => {
  const db = getDB();
  const data = { ...req.body, updated_at: new Date().toISOString() };
  if (!data.id) data.id = uuidv4();
  await db.collection('smtp_settings').updateOne({}, { $set: data }, { upsert: true });
  const { password, _id, ...out } = data;
  res.json(out);
});

router.post('/smtp/test', requireAdmin, async (req, res) => {
  const db = getDB();
  const { test_email } = req.body;
  const settings = await db.collection('smtp_settings').findOne({});
  if (!settings) return res.status(400).json({ detail: 'SMTP ayarları bulunamadı' });

  try {
    const transporter = nodemailer.createTransport({
      host: settings.host, port: settings.port,
      secure: !settings.use_tls,
      auth: { user: settings.username, pass: settings.password }
    });
    await transporter.sendMail({
      from: `"${settings.from_name || 'VMS360'}" <${settings.from_email}>`,
      to: test_email,
      subject: 'VMS360 Test E-postası',
      text: 'Bu bir test e-postasıdır. SMTP ayarlarınız doğru çalışıyor.'
    });
    res.json({ success: true, message: 'Test e-postası gönderildi' });
  } catch (e) {
    res.status(400).json({ detail: `E-posta gönderilemedi: ${e.message}` });
  }
});

module.exports = router;
