// backend/auth/routes/transactions.js
const express = require('express');
const router = express.Router();

const pool = require('../../db');
const { authenticateToken } = require('../middleware/authMiddleware');

const NAME_FIELDS_SQL = `
  t.sender_id,
  t.recipient_id,
  (COALESCE(s.first_name,'') || ' ' || COALESCE(s.last_name,''))::text AS sender_name,
  (COALESCE(r.first_name,'') || ' ' || COALESCE(r.last_name,''))::text AS recipient_name,
  CASE
    WHEN t.type = 'debit'  THEN (COALESCE(r.first_name,'') || ' ' || COALESCE(r.last_name,''))
    WHEN t.type = 'credit' THEN (COALESCE(s.first_name,'') || ' ' || COALESCE(s.last_name,''))
    ELSE (COALESCE(s.first_name,'') || ' ' || COALESCE(s.last_name,''))
  END::text AS counterparty_name
`;

// 🔍 GET /api/transactions/recent
router.get('/recent', authenticateToken, async (req, res) => {
  const { role, type } = req.user;
  if (role !== 'admin' || !['accountant', 'treasury'].includes(type)) {
    return res.status(403).json({ message: 'You do not have permission to view these transactions.' });
  }

  try {
    const { rows } = await pool.query(`
      SELECT
        t.id,
        t.user_id,
        t.wallet_id,
        t.type,
        t.amount_cents,
        t.note,
        t.created_at,
        ${NAME_FIELDS_SQL}
      FROM transactions t
      LEFT JOIN users s ON s.id = t.sender_id
      LEFT JOIN users r ON r.id = t.recipient_id
      ORDER BY t.created_at DESC
      LIMIT 50
    `);
    return res.status(200).json(rows);
  } catch (err) {
    console.error('❌ Failed to load transactions:', err);
    return res.status(500).json({ message: 'An error occurred while retrieving transactions.' });
  }
});

// 👤 GET /api/transactions/mine
router.get('/mine', authenticateToken, async (req, res) => {
  const userId = req.user.id;

  try {
    const { rows } = await pool.query(`
      SELECT
        t.id,
        t.wallet_id,
        t.type,
        t.amount_cents,
        t.note,
        t.created_at,
        ${NAME_FIELDS_SQL}
      FROM transactions t
      LEFT JOIN users s ON s.id = t.sender_id
      LEFT JOIN users r ON r.id = t.recipient_id
      WHERE t.user_id = $1
      ORDER BY t.created_at DESC
      LIMIT 50
    `, [userId]);

    return res.status(200).json(rows);
  } catch (err) {
    console.error('❌ Failed to load user transactions:', err);
    return res.status(500).json({ message: 'An error occurred while retrieving your transactions.' });
  }
});

// 📊 GET /api/transactions/report
router.get('/report', authenticateToken, async (req, res) => {
  const { role, type } = req.user;
  const { start, end, type: filterType } = req.query;

  if (role !== 'admin' || !['accountant', 'treasury'].includes(type)) {
    return res.status(403).json({ message: 'You do not have permission to view these transactions.' });
  }

  const values = [];
  const conditions = [];

  if (start) { values.push(start); conditions.push(`t.created_at >= $${values.length}`); }
  if (end)   { values.push(end);   conditions.push(`t.created_at <= $${values.length}`); }
  if (filterType) { values.push(filterType); conditions.push(`t.type = $${values.length}`); }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const { rows } = await pool.query(`
      SELECT
        t.id,
        t.user_id,
        t.wallet_id,
        t.type,
        t.amount_cents,
        t.note,
        t.created_at,
        ${NAME_FIELDS_SQL}
      FROM transactions t
      LEFT JOIN users s ON s.id = t.sender_id
      LEFT JOIN users r ON r.id = t.recipient_id
      ${whereClause}
      ORDER BY t.created_at DESC
      LIMIT 200
    `, values);

    return res.status(200).json(rows);
  } catch (err) {
    console.error('❌ Error loading transaction report:', err);
    return res.status(500).json({ message: 'An error occurred while retrieving report transactions.' });
  }
});

// 📄 GET /api/transactions/user/:userId
router.get('/user/:userId', authenticateToken, async (req, res) => {
  const { role } = req.user;
  const { userId } = req.params;
  const limit  = parseInt(req.query.limit, 10)  || 10;
  const offset = parseInt(req.query.offset, 10) || 0;

  if (role !== 'admin') {
    return res.status(403).json({ message: 'You do not have permission to view these transactions.' });
  }

  try {
    const txRes = await pool.query(`
      SELECT
        t.id,
        t.wallet_id,
        t.type,
        t.amount_cents,
        t.note,
        t.created_at,
        ${NAME_FIELDS_SQL}
      FROM transactions t
      LEFT JOIN users s ON s.id = t.sender_id
      LEFT JOIN users r ON r.id = t.recipient_id
      WHERE t.user_id = $1
      ORDER BY t.created_at DESC
      LIMIT $2 OFFSET $3
    `, [userId, limit, offset]);

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS count FROM transactions WHERE user_id = $1`,
      [userId]
    );

    txRes.rows.forEach(row => {
      try {
        console.log(`🔁 TX ${row.id}: ${row.type.toUpperCase()} | FROM ${row.sender_name} → TO ${row.recipient_name} | $${(row.amount_cents/100).toFixed(2)}`);
      } catch {}
    });

    return res.status(200).json({
      transactions: txRes.rows,
      totalCount: countRes.rows[0].count
    });
  } catch (err) {
    console.error('❌ Failed to load target user transactions:', err);
    return res.status(500).json({ message: 'An error occurred while retrieving transactions.' });
  }
});

// 💰 POST /api/transactions/add-funds
router.post('/add-funds', authenticateToken, async (req, res) => {
  const { role, type, id: adminId } = req.user;
  if (role !== 'admin' || !['accountant', 'treasury'].includes(type)) {
    return res.status(403).json({ message: 'You do not have permission to add funds.' });
  }

  const client = await pool.connect();
  try {
    const { treasury_wallet_id, wallet_id, user_id, amount, note } = req.body;

    if (!treasury_wallet_id || !wallet_id || !user_id || amount == null) {
      return res.status(400).json({ message: 'Missing required fields.' });
    }

    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      return res.status(400).json({ message: 'Invalid amount.' });
    }

    const amount_cents = Math.round(amountNum * 100);
    const debitNote  = note || 'Funds issued';
    const creditNote = 'Received from Government Assistance';

    await client.query('BEGIN');

    // Verify treasury wallet exists & get its owner (sender)
    const treas = await client.query(
      `SELECT id, user_id FROM wallets WHERE id = $1`,
      [treasury_wallet_id]
    );
    if (!treas.rowCount) throw new Error('Treasury wallet not found');
    const treasuryUserId = treas.rows[0].user_id;

    // Verify recipient wallet belongs to user_id
    const recip = await client.query(
      `SELECT id FROM wallets WHERE id = $1 AND user_id = $2`,
      [wallet_id, user_id]
    );
    if (!recip.rowCount) {
      throw new Error('Recipient wallet does not belong to the specified user');
    }

    // 1) Debit from Treasury wallet
    await client.query(
      `INSERT INTO transactions (
         wallet_id, user_id, type, amount_cents, note, created_at,
         added_by, sender_id, recipient_id
       )
       VALUES ($1, $2, 'debit', $3, $4, NOW(),
               $5, $6, $7)`,
      [
        treasury_wallet_id,        // wallet debited
        treasuryUserId,            // owner of treasury wallet
        amount_cents,
        debitNote,
        adminId,                   // which admin performed the action
        treasuryUserId,            // FROM
        user_id                    // TO
      ]
    );

    // 2) Credit to Recipient wallet
    await client.query(
      `INSERT INTO transactions (
         wallet_id, user_id, type, amount_cents, note, created_at,
         added_by, sender_id, recipient_id
       )
       VALUES ($1, $2, 'credit', $3, $4, NOW(),
               $5, $6, $7)`,
      [
        wallet_id,                 // wallet credited
        user_id,                   // recipient user
        amount_cents,
        creditNote,
        adminId,
        treasuryUserId,            // FROM
        user_id                    // TO
      ]
    );

    await client.query('COMMIT');
    return res.status(200).json({ message: 'Funds added successfully' });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Add Funds Error:', err);
    return res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
