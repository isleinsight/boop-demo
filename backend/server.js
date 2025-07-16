// backend/server.js
const authenticateToken = require('./middleware/authMiddleware');
require('dotenv').config({ path: __dirname + '/.env' });

const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const { exec } = require('child_process');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ✅ Auth routes
const authRoutes = require('./auth/auth');
app.use('/auth', authRoutes); // routes like /auth/login, /auth/signup

// ✅ API routes
const usersRoute = require('./auth/routes/users');
const cardsRoute = require('./auth/routes/cards');
const walletRoutes = require('./auth/routes/wallets'); 
const vendorsRoute = require('./auth/routes/vendors');
const userStudentsRoute = require('./auth/routes/userStudents');


app.use('/api/users', usersRoute);
app.use('/api/cards', cardsRoute);
app.use('/api/wallets', walletRoutes); 
app.use('/api/vendors', vendorsRoute);
app.use('/api/user-students', userStudentsRoute);

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

// ✅ Optional webhook logic
const webhookRoutes = require('./webhook-handler');
app.use('/webhook', webhookRoutes);

// ✅ Catch 404s
app.use((req, res) => {
  res.status(404).json({ error: "Not Found" });
});

// ✅ Global error handler
app.use((err, req, res, next) => {
  console.error("🔥 Unhandled server error:", err);
  res.status(500).json({ error: "Internal Server Error" });
});

// ✅ Start the server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
