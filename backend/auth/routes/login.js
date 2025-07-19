// backend/auth/routes/login.js
const express = require('express');
const router = express.Router();
require('dotenv').config();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const pool = require('../../db');

router.post('/', async (req, res) => {
  console.log("🛰️ Login route hit");

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
      console.log("❌ No matching user found");
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = result.rows[0];
    console.log("✅ Found user:", user.id);

    if (typeof user.password_hash !== 'string') {
      return res.status(500).json({ message: 'Server error (corrupt password)' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      console.log("❌ Incorrect password");
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const allowedRoles = roleMap[audience];
    if (!allowedRoles.includes(user.role)) {
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

    // 🧠 Insert or update pre-session row
    try {
      const existingSession = await pool.query(
        'SELECT id FROM jwt_sessions WHERE user_id = $1',
        [user.id]
      );

      if (existingSession.rows.length > 0) {
        console.log("🔁 Updating existing session");
        await pool.query(
          `UPDATE jwt_sessions
           SET jwt_token = $1, created_at = NOW(), expires_at = NOW() + INTERVAL '2 hours', is_online = true
           WHERE user_id = $2`,
          [token, user.id]
        );
      } else {
        console.log("🆕 Inserting new session row");
        await pool.query(
          `INSERT INTO jwt_sessions (user_id, jwt_token, created_at, expires_at, is_online)
           VALUES ($1, $2, NOW(), NOW() + INTERVAL '2 hours', true)`,
          [user.id, token]
        );
      }

    } catch (err) {
      console.error("🔥 Session write failed:", err.message);
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
    console.error("🔥 Login route error:", err.message);
    res.status(500).json({ message: 'Server error during login' });
  }
});

module.exports = router;
