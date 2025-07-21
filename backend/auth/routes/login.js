const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const pool = require('../../db');

// POST /auth/login
router.post('/', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'User not found. Please check your email address.' });
    }

    const user = result.rows[0];

    // 🛑 Suspended check
    if (user.status === 'suspended') {
      return res.status(403).json({ message: 'Your account is suspended. Please contact support.' });
    }

    // 🔐 Password check
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ message: 'Incorrect password. Please try again.' });
    }

    // ✅ Token creation
    const payload = {
      id: user.id,
      email: user.email,
      role: user.role,
      type: user.type
    };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '2h' });

    // ⏱️ Expiry timestamp
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(); // 2 hours

    // 💾 Upsert session row
    await pool.query(`
      INSERT INTO sessions (email, user_id, jwt_token, created_at, expires_at, status)
      VALUES ($1, $2, $3, NOW(), $4, 'online')
      ON CONFLICT (email) DO UPDATE SET
        jwt_token = EXCLUDED.jwt_token,
        created_at = NOW(),
        expires_at = $4,
        status = 'online'
    `, [user.email, user.id, token, expiresAt]);

    // 🚀 Send response
    return res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        type: user.type,
        name: `${user.first_name} ${user.last_name}`
      }
    });

  } catch (err) {
    console.error('🔥 Login error:', err);
    return res.status(500).json({
      message: 'Server error. Please try again later or contact support.'
    });
  }
});

module.exports = router;
