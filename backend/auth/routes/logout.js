// backend/auth/routes/logout.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const pool = require('../../db');

router.post('/', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    console.warn('🚫 No token provided during logout');
    return res.status(400).json({ message: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;

    // 📴 Mark session offline
    const result = await pool.query(
      `UPDATE jwt_sessions
       SET is_online = false, jwt_token = NULL
       WHERE user_id = $1`,
      [userId]
    );

    console.log(`✅ User ${userId} logged out:`, result.rowCount > 0 ? 'Updated' : 'No session found');

    return res.status(200).json({ message: 'Logged out successfully' });

  } catch (err) {
    console.error('🔥 Logout error:', err.message);
    return res.status(500).json({ message: 'Logout failed' });
  }
});

module.exports = router;
