// backend/auth.js
require('dotenv').config(); // 👈 MUST come first!

const express = require('express');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const router = express.Router();

// PostgreSQL connection
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT, 10),
  ssl: false // set to true if using managed DB with SSL
});

// POST /login route
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  console.log('🔍 Login attempt from:', email);

  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1 AND status = $2',
      [email, 'active']
    );

    if (result.rows.length === 0) {
      console.warn('⚠️ User not found or inactive:', email);
      return res.status(401).json({ message: 'Invalid credentials (user not found)' });
    }

    const user = result.rows[0];
    console.log('✅ User found in DB:', user.email);

    const match = await bcrypt.compare(password, user.password_hash);
    console.log('🔑 Password match result:', match);

    if (!match) {
      console.warn('❌ Password incorrect');
      return res.status(401).json({ message: 'Invalid credentials (incorrect password)' });
    }

   // 🔐 Generate JWT token
const token = jwt.sign(
  {
    id: user.id,
    email: user.email,
    role: user.role,
    type: user.type, // optional: includes super_admin
  },
  process.env.JWT_SECRET,
  { expiresIn: "1d" }
);

res.status(200).json({
  message: 'Login successful',
  token, // 🧠 frontend will save this
  user: {
    id: user.id,
    email: user.email,
    name: `${user.first_name} ${user.last_name}`,
    role: user.role,
    type: user.type
  }
});
  } catch (err) {
    console.error('🔥 Login error:', err.message);
    res.status(500).json({ message: 'Server error during login' });
  }
});

module.exports = router;
