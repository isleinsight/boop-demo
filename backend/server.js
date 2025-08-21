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

// ⬇️ NEW: import your DB pool so we can fetch names for /api/me
const pool = require('./db'); // if your db file is elsewhere, adjust the path

const app = express();
const PORT = process.env.PORT || 8080;

console.log('🔧 server.js is initializing...');

// ───────────────── middleware ─────────────────
app.use(cors());
app.use(express.json());
// serve the static site
app.use(express.static(path.join(__dirname, '..', 'public')));

// Helper: mount with logging so failures don’t kill the whole server
function mount(pathPrefix, modPath, label = modPath) {
  try {
    const router = require(modPath);
    app.use(pathPrefix, router);
    console.log(`✅ mounted ${pathPrefix} -> ${label}`);
  } catch (err) {
    console.error(`❌ failed to mount ${pathPrefix} from ${label}:`, err.message);
  }
}

// ───────────────── routes ─────────────────
// Auth (legacy + current logout, keep both)
mount('/auth/login', './auth/routes/login', 'login');
mount('/logout', './auth/routes/logout', 'logout (legacy)');
mount('/api/logout', './auth/routes/logout', 'logout (api)');

// Core APIs
mount('/api/users', './auth/routes/users');
mount('/api/cards', './auth/routes/cards');
mount('/api/wallets', './auth/routes/wallets');
mount('/api/vendors', './auth/routes/vendors'); // admin vendors list/update/delete
mount('/api/vendor', './auth/routes/vendor-passport', 'vendor-passport');
mount('/api/passport', './auth/routes/passport', 'passport');
mount('/api/passport-charge', './auth/routes/passport-charge');

// ✅ singular vendor API used by the vendor portal (e.g. /api/vendor/transactions/report)
mount('/api/vendor', './auth/routes/vendors', 'vendor'); 

mount('/api/students', './auth/routes/students');
mount('/api/user-students', './auth/routes/userStudents');
mount('/api/sessions', './auth/routes/sessions');
mount('/api/transactions', './auth/routes/transactions');
mount('/api/payouts', './auth/routes/payouts');
mount('/api/sales', './auth/routes/sales');

// NEW routes you asked for
mount('/api/transfers', './auth/routes/transfers');
mount('/api/bank-accounts', './auth/routes/bank-accounts');
mount('/api/password', './auth/routes/password');

// Treasury
mount('/api/treasury', './auth/routes/treasury', 'treasury');

// Admin actions
mount('/api/admin-actions', './auth/routes/admin-actions');

// ───────────────── Who am I (returns names) ─────────────────
// ⬇️ REPLACED: now queries DB so you get first_name + last_name (and more)
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

    // If you use this to force logouts, respect it
    if (me.force_signed_out) {
      return res.status(401).json({ message: 'Signed out' });
    }

    res.json(me); // includes first_name + last_name ✅
  } catch (e) {
    console.error('Error in /api/me:', e.message);
    res.status(500).json({ message: 'Failed to load user' });
  }
});

// Health
app.get('/health', (_req, res) => res.send('OK'));

// GitHub webhook
app.post('/webhook', (req, res) => {
  console.log('🔔 GitHub Webhook triggered');
  exec('cd ~/boop-demo && git pull && pm2 restart all', (err, stdout) => {
    if (err) return res.status(500).send('Git pull failed');
    console.log('✅ Webhook git pull success:\n', stdout);
    res.status(200).send('Git pull and restart complete');
  });
});
mount('/webhook', './webhook-handler', 'webhook-handler');

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// Error handler
app.use((err, _req, res, _next) => {
  console.error('🔥 Unhandled server error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Start
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
