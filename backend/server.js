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

const app = express();
const PORT = process.env.PORT || 8080;
const path = require('path');
app.use(express.static(path.join(__dirname, '..', 'public')));
console.log('🔧 server.js is initializing...');

// ───────────────── middleware ─────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

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
mount('/api/vendors', './auth/routes/vendors');
mount('/api/students', './auth/routes/students');
mount('/api/user-students', './auth/routes/userStudents');
mount('/api/sessions', './auth/routes/sessions');
mount('/api/transactions', './auth/routes/transactions');

// NEW routes you asked for
mount('/api/transfers', './auth/routes/transfers');
mount('/api/bank-accounts', './auth/routes/bank-accounts');
mount('/api/password', './auth/routes/password');

// Treasury (wrapped)
mount('/api/treasury', './auth/routes/treasury', 'treasury');

// Admin actions (leave as-is)
mount('/api/admin-actions', './auth/routes/admin-actions');

// Who am I
app.get('/api/me', authenticateToken, (req, res) => {
  const { id, userId, email, role, type } = req.user;
  res.json({ id: userId || id, email, role, type });
});

// Health
app.get('/health', (_req, res) => res.send('OK'));

// GitHub webhook
app.post('/webhook', (req, res) => {
  console.log('🔔 GitHub Webhook triggered');
  exec('cd ~/boop-demo && git pull && pm2 restart all', (err, stdout, stderr) => {
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
