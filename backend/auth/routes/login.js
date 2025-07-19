// backend/auth/routes/login.js
const express = require('express');
const router = express.Router();
require('dotenv').config();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const pool = require('../../db');

router.post('/', async (req, res) => {
  console.log('🛰️ Received login request at:', req.originalUrl);

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
    console.log('🔑 Login attempt from:', email, '| Audience:', audience);

    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1 AND status = $2',
      [email, 'active']
    );

    if (result.rows.length === 0) {
      console.log('❌ No matching user found or user inactive');
      return res.status(401).json({ message: 'Invalid credentials (user not found)' });
    }

    const user = result.rows[0];
    console.log('✅ User found in DB:', { id: user.id, email: user.email, role: user.role });

    if (!user.id) {
      console.log('⚠️ User record missing ID');
      return res.status(500).json({ message: 'User ID missing from record' });
    }

    if (typeof user.password_hash !== 'string') {
      console.log('❌ Invalid password hash type:', typeof user.password_hash);
      return res.status(500).json({ message: 'Password hash corrupted' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    console.log('🔐 Password match result:', match);

    if (!match) {
      return res.status(401).json({ message: 'Invalid credentials (wrong password)' });
    }

    const allowedRoles = roleMap[audience];
    if (!allowedRoles.includes(user.role)) {
      console.log('⛔ Unauthorized role:', user.role);
      return res.status(403).json({ message: 'Unauthorized role for this login' });
    }

    await pool.query('UPDATE users SET force_signed_out = false WHERE id = $1', [user.id]);

    // ✅ JWT with `id` instead of `userId`
    const tokenPayload = {
      id: user.id,
      email: user.email,
      role: user.role,
      type: user.type
    };

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '2h' });
    console.log('🔐 JWT created with payload:', tokenPayload);

    // ✅ Insert session
    console.log('📥 Attempting session insert for user ID:', user.id);

    try {
      const insertQuery = `
        INSERT INTO jwt_sessions (user_id, jwt_token, created_at, expires_at)
        VALUES ($1, $2, NOW(), NOW() + INTERVAL '2 hours') RETURNING *
      `;

      const insertResult = await pool.query(insertQuery, [user.id, token]);
      console.log('✅ Session inserted into table:', insertResult.rows[0]);

    } catch (insertErr) {
      console.error('❌ Failed to insert session:', insertErr.message);
    }

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
    console.error('🔥 Unhandled login error:', err.message);
    res.status(500).json({ message: 'Server error during login' });
  }
});

module.exports = router;
