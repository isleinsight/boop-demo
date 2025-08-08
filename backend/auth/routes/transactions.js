const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { authenticateToken } = require('../middleware/authMiddleware');

// 🔍 GET /api/transactions/recent
router.get('/recent', authenticateToken, async (req, res) => {
  const { role, type } = req.user;
  if (role !== 'admin' || !['accountant', 'treasury'].includes(type)) {
    return res.status(403).json({ message: 'You do not have permission to view these transactions.' });
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
        COALESCE(
          v.business_name,
          u.first_name || ' ' || COALESCE(u.last_name, ''),
          'System'
        ) AS counterparty_name
      FROM transactions t
      LEFT JOIN vendors v ON v.id = t.vendor_id
      LEFT JOIN users u ON u.id = t.added_by
      ORDER BY t.created_at DESC
      LIMIT 50
    `);
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('❌ Failed to load transactions:', err.message);
    res.status(500).json({ message: 'An error occurred while retrieving transactions.' });
  }
});

// 👤 GET /api/transactions/mine
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
    res.status(500).json({ message: 'An error occurred while retrieving your transactions.' });
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
        COALESCE(
          v.business_name,
          u.first_name || ' ' || COALESCE(u.last_name, ''),
          'System'
        ) AS counterparty_name
      FROM transactions t
      LEFT JOIN vendors v ON v.id = t.vendor_id
      LEFT JOIN users u ON u.id = t.added_by
      ${whereClause}
      ORDER BY t.created_at DESC
      LIMIT 200
    `, values);
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('❌ Error loading transaction report:', err.message);
    res.status(500).json({ message: 'An error occurred while retrieving report transactions.' });
  }
});


// 📄 POST /api/transactions/add-funds
router.post('/add-funds', authenticateToken, async (req, res) => {
  try {
    const { recipientUserId, amountCents, note } = req.body;
    const ADMIN_ID = req.user.id; // The admin doing it
    const GOV_ID = '00000000-0000-0000-0000-000000000000';

    console.log('💸 Add Funds Request:', { recipientUserId, amountCents, note, ADMIN_ID });

    // Get recipient wallet
    const walletRes = await pool.query('SELECT id FROM wallets WHERE user_id = $1', [recipientUserId]);
    if (walletRes.rowCount === 0) {
      console.error('❌ No wallet found for recipient');
      return res.status(400).json({ message: 'No wallet found for recipient' });
    }
    const walletId = walletRes.rows[0].id;

    // Insert credit transaction
    const result = await pool.query(`
      INSERT INTO transactions (
        user_id, wallet_id, type, amount_cents, currency,
        note, added_by, sender_id, recipient_id
      )
      VALUES ($1, $2, 'credit', $3, 'BMD', $4, $5, $6, $7)
      RETURNING *
    `, [
      recipientUserId, walletId, amountCents, note || 'Received from Government Assistance',
      ADMIN_ID, GOV_ID, recipientUserId
    ]);

    console.log('✅ Credit transaction inserted:', result.rows[0]);
    res.status(200).json({ message: 'Funds added', transaction: result.rows[0] });

  } catch (err) {
    console.error('🔥 Error in add-funds:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// 📄 GET /api/transactions/user/:userId
router.get('/user/:userId', authenticateToken, async (req, res) => {
  const { role } = req.user;
  const { userId } = req.params;
  const limit = parseInt(req.query.limit) || 10;
  const offset = parseInt(req.query.offset) || 0;

  if (role !== 'admin') {
    return res.status(403).json({ message: 'You do not have permission to view these transactions.' });
  }

  try {
    console.log(`🔍 Fetching transactions for user ${userId} with limit ${limit} and offset ${offset}`);

    const result = await pool.query(`
      SELECT
        t.id,
        t.type,
        t.amount_cents,
        t.currency,
        t.note,
        t.created_at,
        t.sender_id,
        t.recipient_id,
        t.user_id,
        t.wallet_id,

        -- FROM name logic
        CASE
          WHEN t.sender_id = '00000000-0000-0000-0000-000000000000' THEN 'Government Assistance'
          ELSE CONCAT_WS(' ', senders.first_name, senders.last_name)
        END AS from_user_name,

        -- TO name logic
        CASE
          WHEN t.recipient_id = '00000000-0000-0000-0000-000000000000' THEN 'Government Assistance'
          ELSE CONCAT_WS(' ', recipients.first_name, recipients.last_name)
        END AS to_user_name

      FROM transactions t
      LEFT JOIN users senders ON t.sender_id = senders.id
      LEFT JOIN users recipients ON t.recipient_id = recipients.id

      WHERE t.user_id = $1
      ORDER BY t.created_at DESC
      LIMIT $2 OFFSET $3
    `, [userId, limit, offset]);

    console.log(`✅ Loaded ${result.rowCount} transactions`);

    // Log each transaction row
    result.rows.forEach(tx => {
      console.log(`🔁 TX: ${tx.id} | FROM: ${tx.from_user_name} | TO: ${tx.to_user_name} | $${(tx.amount_cents / 100).toFixed(2)} ${tx.currency}`);
    });

    const countRes = await pool.query(
      `SELECT COUNT(*) FROM transactions WHERE user_id = $1`,
      [userId]
    );

    res.status(200).json({
      transactions: result.rows,
      totalCount: parseInt(countRes.rows[0].count, 10)
    });

  } catch (err) {
    console.error('🔥 Failed to load transactions:', err.message);
    res.status(500).json({ message: 'An error occurred while retrieving transactions.' });
  }
});

module.exports = router;
