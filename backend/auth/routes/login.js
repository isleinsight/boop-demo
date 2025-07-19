// backend/auth/routes/login.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../../db');
const fs = require('fs');
const path = require('path');

const logFile = path.join(__dirname, '../../../login-debug.log');
function logDebug(message, data = null) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}` + (data ? ` ${JSON.stringify(data)}` : '') + '\n';
  fs.appendFileSync(logFile, line);
  console.log(line);
}

logDebug('✅ Login route file loaded');

router.post('/', async (req, res) => {
  const { email, password, audience } = req.body;

  if (!email || !password) return res.status(400).json({ message: 'Email and password required.' });

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
    logDebug('🔍 Login attempt from:', email);

    const userResult = await pool.query(
      'SELECT * FROM users WHERE email = $1 AND status = $2',
      [email, 'active']
    );

    if (userResult.rows.length === 0) {
      logDebug('❌ No user found or inactive', { email });
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = userResult.rows[0];
    logDebug('✅ User found in DB:', { email: user.email });

    const match = await bcrypt.compare(password, user.password_hash);
    logDebug('🔑 Password match result:', match);

    if (!match) return res.status(401).json({ message: 'Invalid credentials' });

    if (!roleMap[audience].includes(user.role)) {
      return res.status(403).json({ message: 'Unauthorized role for login' });
    }

    // 🔓 Clear force sign-out
    await pool.query('UPDATE users SET force_signed_out = false WHERE id = $1', [user.id]);

    // 🔐 Create JWT
    const tokenPayload = {
      id: user.id,
      email: user.email,
      role: user.role,
      type: user.type
    };

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '2h' });
    logDebug('🔐 Token decoded:', jwt.decode(token));

    // 📥 Upsert into jwt_sessions
    try {
      logDebug('📥 Attempting session upsert:', { id: user.id });

      const upsertQuery = `
        INSERT INTO jwt_sessions (user_id, jwt_token, created_at, expires_at)
        VALUES ($1, $2, NOW(), NOW() + INTERVAL '2 hours')
        ON CONFLICT (user_id) DO UPDATE
        SET jwt_token = EXCLUDED.jwt_token,
            created_at = NOW(),
            expires_at = NOW() + INTERVAL '2 hours'
        RETURNING *;
      `;

      const upsertResult = await pool.query(upsertQuery, [user.id, token]);

      logDebug('✅ Session inserted or updated:', upsertResult.rows[0]);

    } catch (err) {
      logDebug('❌ Session upsert failed:', { message: err.message });
    }

    // 🎉 Success
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
    logDebug('🔥 Unhandled login error:', { message: err.message });
    res.status(500).json({ message: 'Server error during login' });
  }
});

module.exports = router;
