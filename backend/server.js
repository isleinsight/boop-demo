require('dotenv').config({ path: __dirname + '/.env' });

console.log("HSBC =", process.env.TREASURY_WALLET_ID_HSBC);
console.log("BUTTERFIELD =", process.env.TREASURY_WALLET_ID_BUTTERFIELD);

const express = require('express');
const cors = require('cors');
const path = require('path');
const { exec } = require('child_process');
const { authenticateToken } = require('./auth/middleware/authMiddleware');

const app = express();
const PORT = process.env.PORT || 8080;

console.log("🔧 server.js is initializing...");

// ───────────────── middleware ─────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// quick root ping (optional)
app.get('/', (_req, res) => res.send('BOOP API running'));

// ───────────────── routes ─────────────────
try {
  // Auth
  app.use('/auth/login', require('./auth/routes/login'));

  // Logout (support both paths so old pages keep working)
  const logoutRouter = require('./auth/routes/logout');
  app.use('/api/logout', logoutRouter);
  app.use('/logout', logoutRouter);

  // Domain APIs
  app.use('/api/users',         require('./auth/routes/users'));
  app.use('/api/cards',         require('./auth/routes/cards'));
  app.use('/api/wallets',       require('./auth/routes/wallets'));
  app.use('/api/vendors',       require('./auth/routes/vendors'));
  app.use('/api/students',      require('./auth/routes/students'));
  app.use('/api/user-students', require('./auth/routes/userStudents'));
  app.use('/api/sessions',      require('./auth/routes/sessions'));
  app.use('/api/transactions',  require('./auth/routes/transactions'));

  // NEW/CONFIRMED
  app.use('/api/transfers',     require('./auth/routes/transfers'));
  app.use('/api/bank-accounts', require('./auth/routes/bank-accounts'));
  app.use('/api/password',      require('./auth/routes/password'));

  // Treasury
  try {
    const treasuryRoutes = require('./auth/routes/treasury');
    console.log('✅ treasury routes required OK');
    app.use('/api/treasury', treasuryRoutes);
    console.log('✅ treasury routes mounted at /api/treasury');
  } catch (err) {
    console.error('❌ Route load failure (treasury):', err && err.stack || err);
  }

  console.log('✅ All routes mounted');
} catch (err) {
  console.error("❌ Route load failure:", err.message);
}

// Who am I
app.get('/api/me', authenticateToken, (req, res) => {
  const { id, userId, email, role, type } = req.user;
  res.json({ id: userId || id, email, role, type });
});

// Health
app.get('/health', (_req, res) => res.send('OK'));

// GitHub webhook (your existing)
app.post('/webhook', (req, res) => {
  console.log('🔔 GitHub Webhook triggered');
  exec('cd ~/boop-demo && git pull && pm2 restart all', (err, stdout, stderr) => {
    if (err) {
      console.error('❌ Webhook git pull failed:', stderr);
      return res.status(500).send('Git pull failed');
    }
    console.log('✅ Webhook git pull success:\n', stdout);
    res.status(200).send('Git pull and restart complete');
  });
});
app.use('/webhook', require('./webhook-handler'));

// 404
app.use((req, res) => {
  res.status(404).json({ error: "Not Found" });
});

// Error handler
app.use((err, _req, res, _next) => {
  console.error("🔥 Unhandled server error:", err);
  res.status(500).json({ error: "Internal Server Error" });
});

// Start
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
