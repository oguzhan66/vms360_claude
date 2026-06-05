#!/usr/bin/env node
const path = require('path');
// pkg ile paketlenince .env exe'nin yanında olmalı
const envPath = process.pkg ? path.join(path.dirname(process.execPath), '.env') : path.join(__dirname, '.env');
require('dotenv').config({ path: envPath });
const express = require('express');
const cors = require('cors');
const { connectDB } = require('./db');

const app = express();
const PORT = process.env.PORT || 8001;

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json({ limit: '10mb' }));

// Routes
const authRouter = require('./routes/auth');
const usersRouter = require('./routes/users');
const locationsRouter = require('./routes/locations');
const storesRouter = require('./routes/stores');
const camerasRouter = require('./routes/cameras');
const settingsRouter = require('./routes/settings');
const vmsRouter = require('./routes/vms');
const liveRouter = require('./routes/live');
const historicalRouter = require('./routes/historical');
const localDataRouter = require('./routes/local_data');
const reportsRouter = require('./routes/reports');
const advancedReportsRouter = require('./routes/advanced_reports');
const smtpRouter = require('./routes/smtp');
const scheduledReportsRouter = require('./routes/scheduled_reports');
const floorsRouter = require('./routes/floors');
const heatmapRouter = require('./routes/heatmap');
const healthRouter = require('./routes/health');
const analyticsRouter = require('./routes/analytics');

app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api', locationsRouter);
app.use('/api/stores', storesRouter);
app.use('/api/cameras', camerasRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/vms', vmsRouter);
// localDataRouter önce — MongoDB snapshot'larından okur
app.use('/api', localDataRouter);
// liveRouter sonra — fallback (VMS direkt)
app.use('/api/live', liveRouter);
app.use('/api/historical', historicalRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/reports/advanced', advancedReportsRouter);
app.use('/api/settings', smtpRouter);
app.use('/api/scheduled-reports', scheduledReportsRouter);
app.use('/api/scheduled-reports-v2', scheduledReportsRouter);
app.use('/api/floors', floorsRouter);
app.use('/api/heatmap', heatmapRouter);
app.use('/api/health', healthRouter);
app.use('/api/analytics', analyticsRouter);

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Frontend static dosyaları — pkg içinde __dirname sanal snapshot'a işaret eder
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

// React SPA — tüm bilinmeyen route'ları index.html'e yönlendir
app.get('*', (req, res) => {
  const indexFile = path.join(publicDir, 'index.html');
  res.sendFile(indexFile);
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ detail: err.message || 'Sunucu hatası' });
});

async function start() {
  try {
    await connectDB();
    await seedAdminUser();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`VMS360 Backend çalışıyor: http://localhost:${PORT}`);
    });
    // Veri toplayıcıyı başlat
    const { startCollector } = require('./collector');
    startCollector();
  } catch (err) {
    console.error('Başlatma hatası:', err);
    process.exit(1);
  }
}

async function seedAdminUser() {
  const bcrypt = require('bcryptjs');
  const { v4: uuidv4 } = require('uuid');
  const { getDB } = require('./db');
  const db = getDB();

  const admin = await db.collection('users').findOne({ username: 'admin' });
  if (!admin) {
    await db.collection('users').insertOne({
      id: uuidv4(), username: 'admin',
      password_hash: bcrypt.hashSync('12345', 10),
      full_name: 'Admin', role: 'admin', is_active: true,
      created_at: new Date().toISOString(),
      allowed_region_ids: [], allowed_city_ids: [], allowed_store_ids: []
    });
    console.log('Admin kullanıcısı oluşturuldu (admin/12345)');
  }

  const operator = await db.collection('users').findOne({ username: 'operator' });
  if (!operator) {
    await db.collection('users').insertOne({
      id: uuidv4(), username: 'operator',
      password_hash: bcrypt.hashSync('12345', 10),
      full_name: 'Operatör', role: 'operator', is_active: true,
      created_at: new Date().toISOString(),
      allowed_region_ids: [], allowed_city_ids: [], allowed_store_ids: []
    });
    console.log('Operatör kullanıcısı oluşturuldu (operator/12345)');
  }
}

start();
