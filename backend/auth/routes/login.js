const express = require('express');
const router = express.Router();
require('dotenv').config();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const pool = require('../../db');

// 🔍 Log file setup
const logFile = path.join(__dirname, '../../../login-debug.log');
function logDebug(message, data = null) {
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] ${message}` + (data ? ` ${JSON.stringify(data)} ` : '') + '\n';
  fs.appendFileSync(logFile, entry);
}

logDebug('🚨 Login route file loaded');

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
    logDebug('🔑 Login attempt', { email, audience });

    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1 AND status = $2',
      [email, 'active']
    );

    if (result.rows.length === 0) {
      logDebug('❌ User not found or inactive');
      return res.status(401).json({ message: 'Invalid credentials (user not found)' });
    }

    const user = result.rows[0];
    logDebug('✅ User found', { id: user.id, email: user.email, role: user.role });

    if (!user.id) {
      logDebug('⚠️ Missing user ID!');
      return res.status(500).json({ message: 'User ID missing from record' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    logDebug('🔍 Password match', { match: isPasswordValid });

    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials (wrong password)' });
    }

    const allowedRoles = roleMap[audience];
    if (!allowedRoles.includes(user.role)) {
      logDebug('❌ Unauthorized role', { userRole: user.role, audience });
      return res.status(403).json({ message: 'Unauthorized role for this login' });
    }

    await pool.query('UPDATE users SET force_signed_out = false WHERE id = $1', [user.id]);

    // 🎟️ Generate token
    const tokenPayload = {
      userId: user.id,
      role: user.role,
      email: user.email,
      type: user.type
    };

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '2h' });
    logDebug('🔐 Token created', tokenPayload);

    // 🗃️ Attempt session insert
    logDebug('📥 Preparing to insert session', { userId: user.id, token });

    try {
      const insertResult = await pool.query(
        `INSERT INTO jwt_sessions (user_id, jwt_token, created_at, expires_at)
         VALUES ($1, $2, NOW(), NOW() + INTERVAL '2 hours') RETURNING *`,
        [user.id, token]
      );
      logDebug('✅ Session inserted', insertResult.rows[0]);
      console.log('✅ Session inserted:', insertResult.rows[0]);
    } catch (insertErr) {
      logDebug('❌ Session insert failed', { message: insertErr.message, stack: insertErr.stack });
      console.error('❌ Session insert error:', insertErr);
    }

    // 🎉 Respond to client
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
    logDebug('🔥 Login route crash', { message: err.message, stack: err.stack });
    console.error('🔥 Login fatal error:', err);
    res.status(500).json({ message: 'Internal server error during login' });
  }
});

module.exports = router;
