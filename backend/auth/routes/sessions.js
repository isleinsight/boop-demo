// backend/auth/routes/sessions.js
const express = require('express');
const router = express.Router();
const pool = require('../../db');

router.post('/', async (req, res) => {
  const { email, status = 'online', jwt_token } = req.body;

  console.log("📥 Incoming session record attempt:");
  console.log("📧 Email:", email);
  console.log("📊 Status:", status);
  console.log("🔐 JWT Token:", jwt_token);

  if (!email || !jwt_token) {
    console.warn("⚠️ Missing required session data (email or jwt_token)");
    return res.status(400).json({ message: "Email and token are required" });
  }

  try {
    await pool.query(
      `INSERT INTO sessions (email, status, jwt_token, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (email)
       DO UPDATE SET
         status = EXCLUDED.status,
         jwt_token = EXCLUDED.jwt_token,
         created_at = NOW()`,
      [email, status, jwt_token]
    );

    console.log("✅ Session successfully recorded for:", email);
    res.status(201).json({ message: 'Session recorded' });
  } catch (err) {
    console.error("🔥 Failed to insert session:", err.message);
    res.status(500).json({ message: 'Session insert failed' });
  }
});

module.exports = router;
