// backend/server.js
require('dotenv').config({ path: __dirname + '/.env' });

console.log('▶ running server file:', __filename);
console.log('HSBC =', process.env.TREASURY_WALLET_ID_HSBC);
console.log('BUTTERFIELD =', process.env.TREASURY_WALLET_ID_BUTTERFIELD);

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { authenticateToken } = require('./auth/middleware/authMiddleware');

// DB pool (used by /api/me)
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 8080;

console.log('🔧 server.js is initializing...');

// ───────────────── middleware ─────────────────
app.use(cors());
app.use(express.json());

// Small helper to mount routers with logging (so a failure doesn't crash boot)
function mount(pathPrefix, modPath, label = modPath) {
  try {
    const router = require(modPath);
    app.use(pathPrefix, router);
    console.log(`✅ mounted ${pathPrefix} -> ${label}`);
  } catch (err) {
    console.error(`❌ failed to mount ${pathPrefix} from ${label}:`, err.message);
  }
}

// ───────────────── simple pings ─────────────────
app.get('/api/ping', (_req, res) => res.json({ ok: true, from: 'server.js' }));
app.get('/health', (_req, res) => res.send('OK'));

// ───────────────── routes ─────────────────
// Auth (legacy + current logout)
mount('/auth/login', './auth/routes/login', 'login');
mount('/logout', './auth/routes/logout', 'logout (legacy)');
mount('/api/logout', './auth/routes/logout', 'logout (api)');

// Core APIs
mount('/api/users', './auth/routes/users');
mount('/api/cards', './auth/routes/cards');
mount('/api/wallets', './auth/routes/wallets');

// Vendors
mount('/api/vendors', './auth/routes/vendors', 'vendors (admin)');
mount('/api/vendor', './auth/routes/vendors', 'vendor');

// Vendor passport charge
mount('/api/vendor', './auth/routes/passport-charge', 'passport-charge');

// Vendor-staff (login + CRUD) — aliases so any path works
mount('/auth/vendor-staff', './auth/routes/vendor-staff', 'vendor-staff (auth)');
mount('/api/vendor/vendorstaff', './auth/routes/vendor-staff', 'vendor-staff (CRUD primary)');
mount('/api/vendor/staff',       './auth/routes/vendor-staff', 'vendor-staff (CRUD alias)');
mount('/api/vendor/vendor-staff','./auth/routes/vendor-staff', 'vendor-staff (CRUD alias)');

// Keep-alive ping for vendor (used by frontend to renew JWT)
app.get('/api/vendor/ping', authenticateToken, (req, res) => {
  const role = String(req.user?.role || req.user?.type || '').toLowerCase();
  if (role !== 'vendor') return res.status(403).json({ message: 'Vendor only' });
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true, ts: Date.now(), staff: !!req.user?.staff });
});

// Passport (protected) — single mount
try {
  const passportRouter = require('./auth/routes/passport');
  app.use('/api/passport', authenticateToken, passportRouter);
  console.log('✅ mounted /api/passport');
} catch (e) {
  console.error('❌ failed to mount /api/passport:', e.message);
}

// Students / parents / sessions / txns / payouts / sales
mount('/api/students', './auth/routes/students');
mount('/api/user-students', './auth/routes/userStudents');
mount('/api/sessions', './auth/routes/sessions');
mount('/api/transactions', './auth/routes/transactions');
mount('/api/payouts', './auth/routes/payouts');
mount('/api/sales', './auth/routes/sales');

// Money movement + bank accounts + password reset
mount('/api/transfers', './auth/routes/transfers');
mount('/api/bank-accounts', './auth/routes/bank-accounts');
mount('/api/password', './auth/routes/password');

// Treasury + Admin actions
mount('/api/treasury', './auth/routes/treasury', 'treasury');
mount('/api/admin-actions', './auth/routes/admin-actions');

// ───────────────── BMDX (conditional) ─────────────────
const BMDX_ENABLED =
  String(process.env.BMDX_ENABLED || 'false').toLowerCase() === 'true';

const bmdxRoutePath = path.join(__dirname, 'auth', 'routes', 'bmdx.js');

if (BMDX_ENABLED && fs.existsSync(bmdxRoutePath)) {
  try {
    const resolved = require.resolve(bmdxRoutePath);
    console.log('✅ bmdx router resolves to:', resolved);
    const bmdxRouter = require(bmdxRoutePath);
    app.use('/api/bmdx', bmdxRouter);
    console.log('✅ mounted /api/bmdx (explicit)');
  } catch (e) {
    console.warn('⚠️ skipping /api/bmdx:', e?.message || e);
  }
} else {
  console.log('ℹ️ /api/bmdx disabled or file missing (set BMDX_ENABLED=true to enable)');
}

// Sanity ping that bypasses router (kept for quick checks)
app.get('/api/bmdx/ping-direct', (_req, res) =>
  res.json({ ok: true, from: 'server.js' })
);

// ───────────────── Webhook (GitHub) ─────────────────
// Keep one implementation (no duplicate mount).
app.post('/webhook', (req, res) => {
  console.log('🔔 GitHub Webhook triggered');
  exec('cd ~/boop-demo && git pull && pm2 restart all', (err, stdout) => {
    if (err) return res.status(500).send('Git pull failed');
    console.log('✅ Webhook git pull success:\n', stdout);
    res.status(200).send('Git pull and restart complete');
  });
});

// ───────────────── Who am I (returns names) ─────────────────
app.get('/api/me', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    if (!userId) return res.status(401).json({ message: 'Not authenticated' });

    const { rows } = await pool.query(
      `SELECT id, email, role, type, first_name, last_name, wallet_id, force_signed_out
         FROM users
        WHERE id = $1`,
      [userId]
    );

    if (!rows.length) return res.status(404).json({ message: 'User not found' });

    const me = rows[0];
    if (me.force_signed_out) return res.status(401).json({ message: 'Signed out' });

    res.json(me);
  } catch (e) {
    console.error('Error in /api/me:', e.message);
    res.status(500).json({ message: 'Failed to load user' });
  }
});

// ✅ Serve the static website from /public (AFTER all API routes)
app.use(express.static(path.join(__dirname, '..', 'public')));

// 404
app.use((req, res) => res.status(404).json({ error: 'Not Found' }));

// Error handler
app.use((err, _req, res, _next) => {
  console.error('🔥 Unhandled server error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Start
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
