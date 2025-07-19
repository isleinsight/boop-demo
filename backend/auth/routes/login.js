// backend/auth/routes/login.js
const express = require('express');
const router = express.Router();
require('dotenv').config();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const pool = require('../../db');

router.post('/', async (req, res) => {
  const { email, password, audience } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  const roleMap = {
    admin: ['admin', 'super_admin'],
    cardholder: ['cardholder', 'student', 'senior'],
    parent: ['parent'],
    vendor: ['vendor']
  };

  if (!audience || !roleMap[audience]) {
    return res.status(400).json({ message: 'Missing or invalid login audience' });
  }

  try {
    console.log('🔍 Login attempt from:', email);

    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1 AND status = $2',
      [email, 'active']
    );

    if (result.rows.length === 0) {
      console.warn('❌ No active user found for email:', email);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = result.rows[0];
    console.log('✅ User found in DB:', user.email);

    const match = await bcrypt.compare(password, user.password_hash);
    console.log('🔑 Password match result:', match);

    if (!match) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (!roleMap[audience].includes(user.role)) {
      console.warn('⛔ Unauthorized role for this audience');
      return res.status(403).json({ message: 'Unauthorized role for this login' });
    }

    await pool.query('UPDATE users SET force_signed_out = false WHERE id = $1', [user.id]);

    const tokenPayload = {
      id: user.id,
      email: user.email,
      role: user.role,
      type: user.type
    };

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '2h' });

    console.log('🔐 Token decoded:', jwt.decode(token));

    // UPSERT based on email
    await pool.query(
      `INSERT INTO jwt_sessions (email, user_id, jwt_token, created_at, expires_at, status)
       VALUES ($1, $2, $3, NOW(), NOW() + INTERVAL '2 hours', 'online')
       ON CONFLICT (email) DO UPDATE SET
         jwt_token = EXCLUDED.jwt_token,
         created_at = NOW(),
         expires_at = NOW() + INTERVAL '2 hours',
         status = 'online',
         user_id = EXCLUDED.user_id`
    , [user.email, user.id, token]);

    console.log('✅ Session upserted for:', user.email);

    res.status(200).json({
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
    res.status(500).json({ message: 'Server error during login' });
  }
});

module.exports = router;
