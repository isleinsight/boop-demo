// backend/auth.js
const express = require('express');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const path = require('path');
const router = express.Router();

// ✅ Load .env config from project root
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// ✅ Confirm password is loading correctly
if (!process.env.DB_PASSWORD) {
  console.error('❌ ENV ERROR: DB_PASSWORD is not set');
} else {
  console.log('✅ ENV loaded: DB_PASSWORD is present');
}

// ✅ Set up DB connection using individual vars
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT, 10),
});

// ✅ POST /login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1 AND status = $2',
      [email, 'active']
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);

    if (!match) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    res.status(200).json({
      message: 'Login successful',
      user: {
        email: user.email,
        role: user.role,
        name: `${user.first_name} ${user.last_name}`
      },
    });
  } catch (err) {
    console.error('❌ Login error:', err.message || err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
