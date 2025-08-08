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


// 💸 POST /api/transactions/add-funds
router.post('/add-funds', authenticateToken, async (req, res) => {
  const { recipientUserId, amountCents, note } = req.body;
  const adminUser = req.user;

  console.log('🔄 Starting Add Funds...');
  console.log('➡️ From Treasury (null sender) to:', recipientUserId);
  console.log('💰 Amount:', amountCents);
  console.log('📝 Note:', note);

  try {
    const recipientUserRes = await pool.query(`SELECT * FROM users WHERE id = $1`, [recipientUserId]);
    const recipientUser = recipientUserRes.rows[0];

    if (!recipientUser) {
      console.error('❌ Recipient user not found');
      return res.status(404).json({ message: 'Recipient user not found.' });
    }

    const walletRes = await pool.query(`SELECT * FROM wallets WHERE user_id = $1`, [recipientUserId]);
    const recipientWallet = walletRes.rows[0];

    if (!recipientWallet) {
      console.error('❌ Wallet not found for user:', recipientUserId);
      return res.status(400).json({ message: 'Recipient wallet not found.' });
    }

    const result = await pool.query(`
      INSERT INTO transactions (
        user_id, amount_cents, currency, type,
        note, wallet_id, added_by, sender_id, recipient_id
      ) VALUES ($1, $2, 'BMD', 'credit', $3, $4, $5, NULL, $6)
      RETURNING *;
    `, [
      recipientUserId,
      amountCents,
      note || 'Received from Government Assistance',
      recipientWallet.id,
      adminUser.id,
      recipientUserId
    ]);

    console.log('✅ Credit transaction inserted:', result.rows[0]);

    res.status(201).json({ message: 'Funds added successfully.', transaction: result.rows[0] });
  } catch (err) {
    console.error('❌ Failed to add funds:', err.message);
    res.status(500).json({ message: 'Error adding funds.' });
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

  console.log(`📥 Fetching transactions for user ${userId} with limit ${limit} and offset ${offset}`);

  try {
    const result = await pool.query(`
      SELECT
        t.id,
        t.wallet_id,
        t.user_id,
        t.type,
        t.amount_cents,
        t.note,
        t.created_at,
        t.sender_id,
        t.recipient_id,
        COALESCE(senders.first_name || ' ' || senders.last_name, 'Government Assistance') AS from_user_name,
        COALESCE(recipients.first_name || ' ' || recipients.last_name, 'Unknown Recipient') AS to_user_name
      FROM transactions t
      LEFT JOIN users senders ON senders.id = t.sender_id
      LEFT JOIN users recipients ON recipients.id = t.recipient_id
      WHERE t.user_id = $1
      ORDER BY t.created_at DESC
      LIMIT $2 OFFSET $3
    `, [userId, limit, offset]);

    result.rows.forEach(tx => {
      console.log(`🧾 TX ${tx.id} | ${tx.type.toUpperCase()} | From: ${tx.from_user_name} (${tx.sender_id}) → To: ${tx.to_user_name} (${tx.recipient_id})`);
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
    console.error('❌ Failed to load transactions:', err.message);
    res.status(500).json({ message: 'An error occurred while retrieving transactions.' });
  }
});

module.exports = router;
