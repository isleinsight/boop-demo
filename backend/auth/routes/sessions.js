// backend/auth/routes/sessions.js
const express = require('express');
const router = express.Router();
const pool = require('../../db');

router.post('/', async (req, res) => {
  const { email, status } = req.body;

  console.log("📥 Incoming session record attempt:");
  console.log("📧 Email:", email);
  console.log("📊 Status:", status);

  if (!email) {
    console.warn("⚠️ Email is missing from session POST body");
    return res.status(400).json({ message: "Email is required" });
  }

  try {
    await pool.query(
      `INSERT INTO sessions (email, status, last_seen)
       VALUES ($1, $2, NOW())`,
      [email, status || 'online']
    );

    console.log("✅ Session successfully recorded for:", email);
    res.status(201).json({ message: 'Session recorded' });
  } catch (err) {
    console.error("🔥 Failed to insert session:", err.message);
    res.status(500).json({ message: 'Session insert failed' });
  }
});

module.exports = router;
