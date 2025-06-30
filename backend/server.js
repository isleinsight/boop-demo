const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const pool = require('./db'); // <-- import DB connection

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Route: POST /login
const loginHandler = require('./login');
app.post('/login', loginHandler);

// ✅ Health check route
app.get('/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.send({ db: 'connected', time: result.rows[0].now });
  } catch (err) {
    res.status(500).send({ db: 'failed', error: err.message });
  }
});

// Fallback: serve index.html (optional)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
