// backend/auth/routes/admin-actions.js
const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { authenticateToken } = require('../middleware/authMiddleware');

// 🧾 GET /api/admin-actions
router.get('/', authenticateToken, async (req, res) => {
  const { role } = req.user;

  if (role !== 'admin') {
    return res.status(403).json({ message: 'Unauthorized access.' });
  }

  try {
    const result = await pool.query(`
      SELECT
        aa.id,
        aa.action,
        aa.status,
        aa.new_email,
        aa.error_message,
        aa.created_at,
        aa.requested_at,
        aa.completed_at,
        aa.failed_at,
        aa.type,
        u1.first_name || ' ' || u1.last_name AS performed_by_name,
        u1.email AS performed_by_email,
        u2.first_name || ' ' || u2.last_name AS target_name,
        u2.email AS target_email
      FROM admin_actions aa
      LEFT JOIN users u1 ON u1.id = aa.performed_by
      LEFT JOIN users u2 ON u2.id = aa.target_user_id
      ORDER BY aa.created_at DESC
      LIMIT 100
    `);

    res.status(200).json(result.rows);
  } catch (err) {
    console.error('❌ Error fetching admin actions:', err.message);
    res.status(500).json({ message: 'Failed to retrieve admin actions.' });
  }
});

module.exports = router;
