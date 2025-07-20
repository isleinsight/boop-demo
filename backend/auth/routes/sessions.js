// backend/auth/routes/sessions.js
const express = require('express');
const router = express.Router();
const pool = require('../../db');

router.post('/', async (req, res) => {
  const { email, status, jwt_token } = req.body;

  if (!email || !jwt_token) {
    return res.status(400).json({ message: "Missing email or token" });
  }

  try {
    await pool.query(
      `INSERT INTO sessions (email, status, last_seen, jwt_token)
       VALUES ($1, $2, NOW(), $3)
       ON CONFLICT (email)
       DO UPDATE SET status = $2, last_seen = NOW(), jwt_token = $3`,
      [email, status || 'online', jwt_token]
    );

    console.log("✅ Session recorded:", email);
    res.status(201).json({ message: 'Session recorded' });
  } catch (err) {
    console.error("❌ Failed to insert session:", err.message);
    res.status(500).json({ message: 'Insert failed' });
  }
});

module.exports = router;
