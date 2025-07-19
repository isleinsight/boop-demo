// backend/auth/routes/login.js
const express = require('express');
const router = express.Router();
require('dotenv').config();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const pool = require('../../db');

// Debug logging to file
const logFile = path.join(__dirname, '../../../login-debug.log');
function logDebug(message, data = null) {
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] ${message}` + (data ? ` ${JSON.stringify(data)} ` : '') + '\n';
  fs.appendFileSync(logFile, entry);
}

// 🚨 File loaded
logDebug('🚨 Login route file loaded');
console.log('🚨 Login route file loaded');

router.post('/', async (req, res) => {
  console.log('📡 Received login request at:', req.originalUrl);
  const { email, password, audience } = req.body;
  console.log('📨 Login payload:', { email, audience });

  if (!email || !password) {
    console.log('❌ Missing email or password');
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  const roleMap = {
    admin: ['admin', 'super_admin'],
    cardholder: ['cardholder', 'student', 'senior'],
    parent: ['parent'],
    vendor: ['vendor']
  };

  if (!audience || !roleMap[audience]) {
    console.log('❌ Invalid audience:', audience);
    return res.status(400).json({ message: 'Missing or invalid login audience' });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1 AND status = $2',
      [email, 'active']
    );

    if (result.rows.length === 0) {
      console.log('❌ No active user found for:', email);
      return res.status(401).json({ message: 'Invalid credentials (user not found)' });
    }

    const user = result.rows[0];
    console.log('✅ User found:', { id: user.id, email: user.email, role: user.role });

    const match = await bcrypt.compare(password, user.password_hash);
    console.log('🔐 Password match result:', match);

    if (!match) {
      return res.status(401).json({ message: 'Invalid credentials (wrong password)' });
    }

    const allowedRoles = roleMap[audience];
    if (!allowedRoles.includes(user.role)) {
      console.log('❌ Role not allowed:', { userRole: user.role, allowedRoles });
      return res.status(403).json({ message: 'Unauthorized role for this login' });
    }

    await pool.query('UPDATE users SET force_signed_out = false WHERE id = $1', [user.id]);

    const tokenPayload = {
      userId: user.id,
      role: user.role,
      email: user.email,
      type: user.type
    };

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '2h' });

    console.log('🔐 JWT created:', token);
    console.log('📦 Token payload:', tokenPayload);

    // Attempt to insert session
    try {
      console.log('📥 Attempting to insert session for user:', user.id);
      const insertResult = await pool.query(
        `INSERT INTO jwt_sessions (user_id, jwt_token, created_at, expires_at)
         VALUES ($1, $2, NOW(), NOW() + INTERVAL '2 hours') RETURNING *`,
        [user.id, token]
      );
      console.log('✅ Session inserted:', insertResult.rows[0]);
    } catch (insertErr) {
      console.error('❌ Failed to insert session:', insertErr);
    }

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
    console.error('🔥 Login route failure:', err);
    return res.status(500).json({ message: 'Server error during login' });
  }
});

module.exports = router;
