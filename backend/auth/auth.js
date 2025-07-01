// backend/auth.js
const express = require('express');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const router = express.Router();

// Set up DB connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // Or hardcode config if needed
});

// POST /login
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

    res.status(200).json({ message: 'Login successful', user: { email: user.email, role: user.role } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
