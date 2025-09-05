// server.js
require('dotenv').config({ path: __dirname + '/.env' });

console.log('▶ running server file:', __filename);
console.log('HSBC =', process.env.TREASURY_WALLET_ID_HSBC);
console.log('BUTTERFIELD =', process.env.TREASURY_WALLET_ID_BUTTERFIELD);

const express = require('express');
const cors = require('cors');
const path = require('path');
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
// Prove API is reachable from the browser: https://payulot.com/api/ping
app.get('/api/ping', (_req, res) => {
  res.json({ ok: true, from: 'server.js' });
});

// Health (non-API) at root: https://payulot.com/health
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

// Vendor passport charge (POST /api/vendor/passport-charge)
mount('/api/vendor', './auth/routes/passport-charge', 'passport-charge');

// Vendor-staff login 
mount('/auth/vendor-staff', './auth/routes/vendor-staff', 'vendor-staff');
// Vendor-managed staff
mount('/api/vendor/vendorstaff', './auth/routes/vendor-staff', 'vendor-staff (CRUD)');

mount('/api/passport', './auth/routes/passport', 'passport');

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

// ✅ BMDX (blockchain health/read-only)
// ───────────────── explicit BMDX mount (with resolve logging) ─────────────────
try {
  const resolved = require.resolve('./auth/routes/bmdx');
  console.log('✅ bmdx router resolves to:', resolved);

  const bmdxRouter = require('./auth/routes/bmdx');
  app.use('/api/bmdx', bmdxRouter);
  console.log('✅ mounted /api/bmdx (explicit)');
} catch (e) {
  console.error('❌ could not mount /api/bmdx:', e?.message || e);
}

// bypass-router sanity ping
app.get('/api/bmdx/ping-direct', (_req, res) => {
  res.json({ ok: true, from: 'server.js' });
});

// Webhook (GitHub)
app.post('/webhook', (req, res) => {
  console.log('🔔 GitHub Webhook triggered');
  exec('cd ~/boop-demo && git pull && pm2 restart all', (err, stdout) => {
    if (err) return res.status(500).send('Git pull failed');
    console.log('✅ Webhook git pull success:\n', stdout);
    res.status(200).send('Git pull and restart complete');
  });
});
mount('/webhook', './webhook-handler', 'webhook-handler');

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
    if (me.force_signed_out) {
      return res.status(401).json({ message: 'Signed out' });
    }

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
