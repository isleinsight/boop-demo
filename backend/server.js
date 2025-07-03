// backend/server.js

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

// ✅ Routes
// Auth
const authRoutes = require('./auth/auth');
app.use('/', authRoutes);

// Users & Cards APIs
const usersRoute = require('./auth/routes/users');
const cardsRoute = require('./routes/cards');
app.use('/api/users', usersRoute);
app.use('/api/cards', cardsRoute);

// ✅ Health check
app.get('/health', (req, res) => {
  res.send('OK');
});

// ✅ GitHub webhook handler
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

// ✅ Optional separate webhook handler module
const webhookRoutes = require('./webhook-handler');
app.use('/', webhookRoutes);

// ✅ Start the server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
