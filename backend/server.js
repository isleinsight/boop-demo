// backend/server.js
require('dotenv').config({ path: __dirname + '/.env' });

const express = require('express');
const cors = require('cors');
const path = require('path');
const { exec } = require('child_process');
const { authenticateToken } = require('./auth/middleware/authMiddleware');

const app = express();
const PORT = process.env.PORT || 3000;

console.log("🔧 server.js is initializing...");

// ✅ Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ✅ Routes (ONE AT A TIME)
try {
  // const authRoutes = require('./auth/auth');
  // app.use('/auth', authRoutes);

  app.use('/auth/login', require('./auth/routes/login'));
  app.use('/logout', require('./auth/routes/logout'));
  // app.use('/api/users', require('./auth/routes/users'));
  // app.use('/api/cards', require('./auth/routes/cards'));
  // app.use('/api/wallets', require('./auth/routes/wallets'));
  // app.use('/api/vendors', require('./auth/routes/vendors'));
  // app.use('/api/user-students', require('./auth/routes/userStudents'));
  app.use('/api/sessions', require('./auth/routes/sessions'));
  app.use('/api/transactions', require('./auth/routes/transactions'));
  app.use('/api/treasury', require('./auth/routes/treasury'));
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
