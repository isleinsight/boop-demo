// backend/auth/routes/login.js
const express = require('express');
const router = express.Router();
require('dotenv').config();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const pool = require('../../db');

// 📢 Basic route load notification
console.log('✅ Login route file loaded');

router.post('/', async (req, res) => {
  console.log('🛰️ Received login request');

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
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1 AND status = $2',
      [email, 'active']
    );

    if (result.rows.length === 0) {
      console.warn('❌ User not found or inactive:', email);
      return res.status(401).json({ message: 'Invalid credentials (user not found)' });
    }

    const user = result.rows[0];
    console.log('✅ User found in DB:', user.email);

    if (!user.id || typeof user.password_hash !== 'string') {
      console.error('⚠️ Invalid user record:', user.id);
      return res.status(500).json({ message: 'Server error: bad user data' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    console.log('🔑 Password match result:', match);

    if (!match) {
      return res.status(401).json({ message: 'Invalid credentials (wrong password)' });
    }

    const allowedRoles = roleMap[audience];
    if (!allowedRoles.includes(user.role)) {
      console.warn('🚫 Unauthorized role for this audience:', user.role);
      return res.status(403).json({ message: 'Unauthorized role for this login' });
    }

    // ✅ Clear force_signed_out if needed
    await pool.query('UPDATE users SET force_signed_out = false WHERE id = $1', [user.id]);

    // 🎟️ Create JWT payload
    const tokenPayload = {
      id: user.id,
      email: user.email,
      role: user.role,
      type: user.type
    };

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '2h' });
    console.log('🔐 Token generated:', tokenPayload);

    // 💾 UPSERT the session token
    try {
      const upsertQuery = `
        INSERT INTO jwt_sessions (user_id, jwt_token, created_at, expires_at)
        VALUES ($1, $2, NOW(), NOW() + INTERVAL '2 hours')
        ON CONFLICT (user_id)
        DO UPDATE SET
          jwt_token = EXCLUDED.jwt_token,
          created_at = NOW(),
          expires_at = NOW() + INTERVAL '2 hours';
      `;

      await pool.query(upsertQuery, [user.id, token]);
      console.log('✅ Session inserted or updated successfully for user:', user.email);
    } catch (insertErr) {
      console.error('❌ Failed to upsert session:', insertErr.message);
    }

    // 🎉 Respond with success
    res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        type: user.type,
        name: `${user.first_name || ''} ${user.last_name || ''}`.trim()
      }
    });

  } catch (err) {
    console.error('🔥 Login route error:', err.message);
    res.status(500).json({ message: 'Internal server error during login' });
  }
});

module.exports = router;
