const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const SECRET = process.env.JWT_SECRET_KEY || 'vms360-secret-key';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'vms360-refresh-secret';
const ACCESS_EXPIRE = '24h';
const REFRESH_EXPIRE = '30d';

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function createAccessToken(data) {
  return jwt.sign(data, SECRET, { expiresIn: ACCESS_EXPIRE });
}

function createRefreshToken(data) {
  return jwt.sign(data, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRE });
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const db = getDB();
    const user = await db.collection('users').findOne({ username }, { projection: { _id: 0 } });
    if (!user || !bcrypt.compareSync(password, user.password_hash || '')) {
      return res.status(401).json({ detail: 'Geçersiz kullanıcı adı veya şifre' });
    }
    if (!user.is_active) {
      return res.status(401).json({ detail: 'Hesap devre dışı' });
    }

    const tokenData = { sub: user.username, role: user.role || 'operator' };
    const accessToken = createAccessToken(tokenData);
    const refreshToken = createRefreshToken(tokenData);

    await db.collection('refresh_tokens').updateOne(
      { username: user.username },
      { $set: { token_hash: hashToken(refreshToken), created_at: new Date().toISOString() } },
      { upsert: true }
    );

    res.json({
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'bearer',
      expires_in: 15 * 60,
      user: { username: user.username, full_name: user.full_name || '', role: user.role || 'operator' }
    });
  } catch (e) {
    res.status(500).json({ detail: e.message });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  try {
    // Frontend query param veya body'den gönderebilir
    const refresh_token = req.body?.refresh_token || req.query?.refresh_token;
    if (!refresh_token) return res.status(401).json({ detail: 'Refresh token gerekli' });

    let payload;
    try { payload = jwt.verify(refresh_token, REFRESH_SECRET); }
    catch { return res.status(401).json({ detail: 'Geçersiz veya süresi dolmuş refresh token' }); }

    const db = getDB();
    const stored = await db.collection('refresh_tokens').findOne({ username: payload.sub });
    if (!stored || stored.token_hash !== hashToken(refresh_token)) {
      return res.status(401).json({ detail: 'Refresh token geçersiz veya iptal edilmiş' });
    }

    const user = await db.collection('users').findOne({ username: payload.sub });
    if (!user || !user.is_active) return res.status(401).json({ detail: 'Hesap devre dışı' });

    const tokenData = { sub: user.username, role: user.role || 'operator' };
    const newAccess = createAccessToken(tokenData);
    const newRefresh = createRefreshToken(tokenData);

    await db.collection('refresh_tokens').updateOne(
      { username: user.username },
      { $set: { token_hash: hashToken(newRefresh), created_at: new Date().toISOString() } }
    );

    res.json({ access_token: newAccess, refresh_token: newRefresh, token_type: 'bearer', expires_in: 15 * 60 });
  } catch (e) {
    res.status(500).json({ detail: e.message });
  }
});

// POST /api/auth/logout
router.post('/logout', requireAuth, async (req, res) => {
  const db = getDB();
  await db.collection('refresh_tokens').deleteOne({ username: req.user.sub });
  res.json({ message: 'Çıkış yapıldı' });
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  const db = getDB();
  const user = await db.collection('users').findOne({ username: req.user.sub }, { projection: { _id: 0, password_hash: 0 } });
  if (!user) return res.status(404).json({ detail: 'Kullanıcı bulunamadı' });
  res.json(user);
});

// POST /api/auth/register (admin only)
router.post('/register', requireAdmin, async (req, res) => {
  try {
    const { username, password, full_name, role = 'operator', allowed_region_ids = [], allowed_city_ids = [], allowed_store_ids = [] } = req.body;
    const db = getDB();
    const existing = await db.collection('users').findOne({ username });
    if (existing) return res.status(400).json({ detail: 'Bu kullanıcı adı zaten kullanımda' });

    const userDoc = {
      id: uuidv4(),
      username,
      password_hash: bcrypt.hashSync(password, 10),
      full_name,
      role,
      is_active: true,
      created_at: new Date().toISOString(),
      allowed_region_ids,
      allowed_city_ids,
      allowed_store_ids
    };
    await db.collection('users').insertOne(userDoc);
    const { password_hash, _id, ...response } = userDoc;
    res.json(response);
  } catch (e) {
    res.status(500).json({ detail: e.message });
  }
});

module.exports = router;
