// backend/auth/routes/login.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const pool = require('../../db');

router.post('/', async (req, res) => {
  const { email, password } = req.body;
  console.log("📨 Login attempt:", email); // DEBUG

  if (!email || !password) {
    console.log("⛔ Missing credentials"); // DEBUG
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  try {
    // 🔍 Check if user exists
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    console.log("🔍 DB result:", result.rows); // DEBUG

    if (result.rows.length === 0) {
      console.log("❌ No account found with that email."); // DEBUG
      return res.status(404).json({ message: 'No account found with that email.' });
    }

    const user = result.rows[0];

    // ❌ Check if suspended
    if (user.status === 'suspended') {
      console.log("⛔ Account suspended"); // DEBUG
      return res.status(403).json({ message: 'This account has been suspended.' });
    }

    // 🔐 Check password
    const match = await bcrypt.compare(password, user.password_hash);
    console.log("🔐 Password match:", match); // DEBUG

    if (!match) {
      console.log("❌ Incorrect password"); // DEBUG
      return res.status(401).json({ message: 'Incorrect password.' });
    }

    // ✅ Create JWT
    const tokenPayload = {
      id: user.id,
      email: user.email,
      role: user.role,
      type: user.type
    };

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '2h' });

    // 🧠 Upsert session
    try {
      await pool.query(`
        INSERT INTO sessions (email, user_id, jwt_token, created_at, expires_at, status)
        VALUES ($1, $2, $3, NOW(), NOW() + INTERVAL '2 hours', 'online')
        ON CONFLICT (email) DO UPDATE SET
          jwt_token = EXCLUDED.jwt_token,
          created_at = NOW(),
          expires_at = NOW() + INTERVAL '2 hours',
          status = 'online'
      `, [user.email, user.id, token]);
    } catch (sessionErr) {
      console.error("❌ Session insert error:", sessionErr.message);
      return res.status(500).json({
        message: 'Server misconfiguration — please contact support.'
      });
    }

    // 🚀 Success response
    console.log("✅ Login successful"); // DEBUG
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
    console.error('🔥 Login error:', err.message);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
