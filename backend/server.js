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

// ✅ Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ✅ Routes
try {
  // Auth-related routes
  app.use('/auth/login', require('./auth/routes/login'));
  app.use('/logout', require('./auth/routes/logout'));

  // API routes
  app.use('/api/users', require('./auth/routes/users'));
  app.use('/api/cards', require('./auth/routes/cards'));
  app.use('/api/wallets', require('./auth/routes/wallets'));
  app.use('/api/vendors', require('./auth/routes/vendors'));
  app.use('/api/students', require('./auth/routes/students'));
  app.use('/api/user-students', require('./auth/routes/userStudents'));
  app.use('/api/sessions', require('./auth/routes/sessions'));
  app.use('/api/transactions', require('./auth/routes/transactions')); // Updated transactions.js
// API routes
app.use('/api/users', require('./auth/routes/users'));
app.use('/api/cards', require('./auth/routes/cards'));
app.use('/api/wallets', require('./auth/routes/wallets'));
app.use('/api/vendors', require('./auth/routes/vendors'));
app.use('/api/students', require('./auth/routes/students'));
app.use('/api/user-students', require('./auth/routes/userStudents'));
app.use('/api/sessions', require('./auth/routes/sessions'));
app.use('/api/transactions', require('./auth/routes/transactions')); // Updated transactions.js

// Mount treasury with explicit logging so we can see if it fails to load
try {
  const treasuryRoutes = require('./auth/routes/treasury');
  console.log('✅ treasury routes required OK');
  app.use('/api/treasury', treasuryRoutes);
  console.log('✅ treasury routes mounted at /api/treasury');
} catch (err) {
  console.error('❌ Route load failure (treasury):', err && err.stack || err);
}

app.use('/api/admin-actions', require('./auth/routes/admin-actions'));
  app.use('/api/admin-actions', require('./auth/routes/admin-actions'));
} catch (err) {
  console.error("❌ Route load failure:", err.message);
}

// ✅ /api/me - current logged-in user info
app.get('/api/me', authenticateToken, (req, res) => {
  const { id, userId, email, role, type } = req.user;
  res.json({
    id: userId || id,
    email,
    role,
    type
  });
});

// ✅ Health check
app.get('/health', (req, res) => {
  res.send('OK');
});

// ✅ GitHub webhook endpoint
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

// ✅ Catch 404s
app.use((req, res) => {
  res.status(404).json({ error: "Not Found" });
});

// ✅ Global error handler
app.use((err, req, res, next) => {
  console.error("🔥 Unhandled server error:", err);
  res.status(500).json({ error: "Internal Server Error" });
});

// ✅ Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
