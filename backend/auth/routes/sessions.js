// backend/auth/routes/sessions.js
const express = require('express');
const router = express.Router();
const pool = require('../../db');
const authenticateToken = require('../middleware/authMiddleware');

router.post('/', async (req, res) => {
  const { email, status } = req.body;

  try {
    await pool.query(
      `INSERT INTO sessions (email, status, last_seen)
       VALUES ($1, $2, NOW())`,
      [email, status || 'online']
    );

    res.status(201).json({ message: 'Session recorded' });
  } catch (err) {
    console.error("🔥 Failed to insert session:", err.message);
    res.status(500).json({ message: 'Session insert failed' });
  }
});

module.exports = router;
