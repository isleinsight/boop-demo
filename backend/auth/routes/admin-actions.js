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

  const {
    page = 1,
    limit = 20,
    start,
    end,
    status,
    search
  } = req.query;

  const offset = (parseInt(page) - 1) * parseInt(limit);
  const values = [];
  const conditions = [];

  if (start) {
    values.push(start);
    conditions.push(`aa.created_at >= $${values.length}`);
  }

  if (end) {
    values.push(end);
    conditions.push(`aa.created_at <= $${values.length}`);
  }

  if (status) {
    values.push(status);
    conditions.push(`aa.status = $${values.length}`);
  }

  if (search) {
    const likeSearch = `%${search.toLowerCase()}%`;
    values.push(likeSearch, likeSearch, likeSearch, likeSearch);
    conditions.push(`
      (
        LOWER(u1.first_name || ' ' || u1.last_name) LIKE $${values.length - 3} OR
        LOWER(u1.email) LIKE $${values.length - 2} OR
        LOWER(u2.first_name || ' ' || u2.last_name) LIKE $${values.length - 1} OR
        LOWER(u2.email) LIKE $${values.length}
      )
    `);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    // 🔢 Total count for pagination
    const countResult = await pool.query(`
      SELECT COUNT(*) AS total
      FROM admin_actions aa
      LEFT JOIN users u1 ON u1.id = aa.performed_by
      LEFT JOIN users u2 ON u2.id = aa.target_user_id
      ${whereClause}
    `, values);
    const totalCount = parseInt(countResult.rows[0].total, 10);

    // 📥 Paged results
    values.push(limit, offset);
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
      ${whereClause}
      ORDER BY aa.created_at DESC
      LIMIT $${values.length - 1} OFFSET $${values.length}
    `, values);

    res.status(200).json({
      actions: result.rows,
      totalCount
    });
  } catch (err) {
    console.error('❌ Error fetching admin actions:', err.message);
    res.status(500).json({ message: 'Failed to retrieve admin actions.' });
  }
});

module.exports = router;
