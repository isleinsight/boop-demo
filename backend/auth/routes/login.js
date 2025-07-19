// backend/auth/routes/login.js
const express = require('express');
const router = express.Router();
require('dotenv').config();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const pool = require('../../db');

router.post('/', async (req, res) => {
  const { email, password, audience } = req.body;
  console.log('📩 Login request received:', { email, audience });

  const roleMap = {
    admin: ['admin', 'super_admin'],
    cardholder: ['cardholder', 'student', 'senior'],
    parent: ['parent'],
    vendor: ['vendor']
  };

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  if (!audience || !roleMap[audience]) {
    return res.status(400).json({ message: 'Missing or invalid login audience' });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1 AND status = $2',
      [email, 'active']
    );

    if (result.rows.length === 0) {
      console.log('❌ No user found or inactive');
      return res.status(401).json({ message: 'Invalid credentials (user not found)' });
    }

    const user = result.rows[0];
    console.log('👤 User retrieved:', {
      id: user.id,
      email: user.email,
      role: user.role
    });

    const match = await bcrypt.compare(password, user.password_hash);
    console.log('🔐 Password match:', match);

    if (!match) {
      return res.status(401).json({ message: 'Invalid credentials (wrong password)' });
    }

    const allowedRoles = roleMap[audience];
    if (!allowedRoles.includes(user.role)) {
      console.log('⛔ Unauthorized role:', user.role);
      return res.status(403).json({ message: 'Unauthorized role' });
    }

    await pool.query('UPDATE users SET force_signed_out = false WHERE id = $1', [user.id]);

    const tokenPayload = {
      userId: user.id,
      role: user.role,
      email: user.email,
      type: user.type
    };

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '2h' });
    console.log('🎟️ JWT created:', tokenPayload);

    // 🔥 Insert into jwt_sessions
    try {
      const insertQuery = `
        INSERT INTO jwt_sessions (user_id, jwt_token, created_at, expires_at)
        VALUES ($1, $2, NOW(), NOW() + INTERVAL '2 hours') RETURNING *
      `;

      const insertValues = [user.id, token];

      console.log('📥 Attempting session insert:', insertValues);

      const insertResult = await pool.query(insertQuery, insertValues);

      console.log('✅ Session inserted:', insertResult.rows[0]);

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
    console.error('🔥 Login failed:', err.message, err.stack);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
