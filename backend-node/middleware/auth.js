const jwt = require('jsonwebtoken');
const { getDB } = require('../db');

const SECRET = process.env.JWT_SECRET_KEY || 'vms360-secret-key';

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ detail: 'Token gerekli' });
  }
  const token = header.split(' ')[1];
  try {
    const payload = jwt.verify(token, SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ detail: 'Geçersiz veya süresi dolmuş token' });
  }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ detail: 'Admin yetkisi gerekli' });
    }
    next();
  });
}

async function checkPermission(req, res, next) {
  requireAuth(req, res, async () => {
    if (req.user.role === 'admin') return next();
    const db = getDB();
    const user = await db.collection('users').findOne({ username: req.user.sub }, { projection: { _id: 0, password_hash: 0 } });
    if (!user) return res.status(401).json({ detail: 'Kullanıcı bulunamadı' });
    req.userDoc = user;
    next();
  });
}

module.exports = { requireAuth, requireAdmin, checkPermission };
