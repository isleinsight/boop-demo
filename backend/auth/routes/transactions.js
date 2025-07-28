// backend/auth/routes/transactions.js
const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { authenticateToken } = require('../middleware/authMiddleware');

// 🔍 GET /api/transactions/recent (Admin + Accountant access)
router.get('/recent', authenticateToken, async (req, res) => {
  const { role, type } = req.user;

  // 🛡️ Authorization
  if (role !== 'admin' || !['accountant', 'treasury'].includes(type)) {
    return res.status(403).json({ message: 'Unauthorized' });
  }

  try {
    const result = await pool.query(`
      SELECT
        t.id,
        t.user_id,
        t.wallet_id,
        t.type,
        t.amount_cents,
        t.note,
        t.created_at,
        u.first_name || ' ' || u.last_name AS user_name,
        u.email AS user_email
      FROM transactions t
      LEFT JOIN users u ON u.id = t.user_id
      ORDER BY t.created_at DESC
      LIMIT 50
    `);

    res.status(200).json(result.rows);
  } catch (err) {
    console.error('❌ Failed to load transactions:', err.message);
    res.status(500).json({ message: 'Failed to retrieve transactions.' });
  }
});

// 👤 GET /api/transactions/mine (User personal history)
router.get('/mine', authenticateToken, async (req, res) => {
  const userId = req.user.id;

  try {
    const result = await pool.query(`
      SELECT
        id,
        wallet_id,
        type,
        amount_cents,
        note,
        created_at
      FROM transactions
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 50
    `, [userId]);

    res.status(200).json(result.rows);
  } catch (err) {
    console.error('❌ Failed to load user transactions:', err.message);
    res.status(500).json({ message: 'Failed to retrieve your transactions.' });
  }
});

// 📊 GET /api/transactions/report – Filterable export-friendly route
router.get('/report', authenticateToken, async (req, res) => {
  const { role, type } = req.user;
  const { start, end, type: filterType } = req.query;

  // 🛡️ Authorization
  if (role !== 'admin' || !['accountant', 'treasury'].includes(type)) {
    return res.status(403).json({ message: 'Unauthorized' });
  }

  // ⛏️ Build dynamic WHERE clause
  const values = [];
  const conditions = [];

  if (start) {
    values.push(start);
    conditions.push(`t.created_at >= $${values.length}`);
  }

  if (end) {
    values.push(end);
    conditions.push(`t.created_at <= $${values.length}`);
  }

  if (filterType) {
    values.push(filterType);
    conditions.push(`t.type = $${values.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const result = await pool.query(`
      SELECT
        t.id,
        t.user_id,
        t.wallet_id,
        t.type,
        t.amount_cents,
        t.note,
        t.created_at,
        u.first_name || ' ' || u.last_name AS user_name,
        u.email AS user_email
      FROM transactions t
      LEFT JOIN users u ON u.id = t.user_id
      ${whereClause}
      ORDER BY t.created_at DESC
      LIMIT 200
    `, values);

    res.status(200).json(result.rows);
  } catch (err) {
    console.error('❌ Error loading transaction report:', err.message);
    res.status(500).json({ message: 'Failed to retrieve report transactions.' });
  }
});

module.exports = router;
