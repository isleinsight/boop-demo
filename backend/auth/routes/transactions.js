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
  const { role, type, id: adminId } = req.user;
  const { wallet_id, user_id, amount, note, added_by } = req.body;

  if (role !== 'admin' || !['accountant', 'treasury'].includes(type)) {
    return res.status(403).json({ error: 'You do not have permission to perform this action.' });
  }

  if (!wallet_id || !user_id || !amount || isNaN(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Please provide all required fields with valid values.' });
  }

  if (added_by !== adminId) {
    return res.status(403).json({ error: 'Invalid request: Added by user does not match authenticated user.' });
  }

  const transferAmount = parseFloat(amount);
  const amount_cents = Math.round(transferAmount * 100);

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // ✅ Get treasury wallet
    const { rows: treasuryRows } = await client.query(`SELECT * FROM wallets WHERE id = $1`, [wallet_id]);
    if (!treasuryRows.length) throw new Error('Treasury wallet not found');
    const treasuryWallet = treasuryRows[0];

    // ✅ Ensure funds available
    if (parseFloat(treasuryWallet.balance) < transferAmount) {
      throw new Error('Insufficient funds in treasury wallet');
    }

    // ✅ Get recipient wallet
    const { rows: recipientRows } = await client.query(`SELECT * FROM wallets WHERE user_id = $1`, [user_id]);
    if (!recipientRows.length) throw new Error('Recipient wallet not found');
    const recipientWallet = recipientRows[0];

    // ✅ Validate user
    const { rows: userRows } = await client.query(
      `SELECT role, first_name, last_name FROM users WHERE id = $1`,
      [user_id]
    );
    const userRole = userRows[0]?.role;
    if (!userRole) throw new Error('Recipient user not found');

    if (['student', 'assistance'].includes(userRole) && note?.toLowerCase().includes('transfer to bank')) {
      throw new Error('This user type cannot receive bank transfers');
    }

    // ✅ Transfer funds
    await client.query(`UPDATE wallets SET balance = balance - $1 WHERE id = $2`, [transferAmount, treasuryWallet.id]);
    await client.query(`UPDATE wallets SET balance = balance + $1 WHERE id = $2`, [transferAmount, recipientWallet.id]);

    // ✅ Insert debit transaction
    const debitNote = note ? `${note} [user_id:${user_id}]` : `Fund transfer to user ${user_id} [user_id:${user_id}]`;
    await client.query(
      `INSERT INTO transactions (
         wallet_id, user_id, type, amount_cents, note, created_at, added_by, sender_id, recipient_id
       )
       VALUES ($1, $2, 'debit', $3, $4, NOW(), $5, $6, $7)`,
      [treasuryWallet.id, treasuryWallet.user_id, amount_cents, debitNote, adminId, treasuryWallet.user_id, user_id]
    );

    // ✅ Insert credit transaction
    await client.query(
      `INSERT INTO transactions (
         wallet_id, user_id, type, amount_cents, note, created_at, added_by, sender_id, recipient_id
       )
       VALUES ($1, $2, 'credit', $3, 'Received from Government Assistance', NOW(), NULL, $4, $2)`,
      [recipientWallet.id, user_id, amount_cents, treasuryWallet.user_id]
    );

    await client.query('COMMIT');
    res.status(201).json({ success: true, message: 'Funds transferred successfully.' });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to add funds:', err.message);
    let userErrorMessage = 'An error occurred while processing the fund transfer.';
    if (err.message === 'Treasury wallet not found') {
      userErrorMessage = 'The selected treasury wallet could not be found.';
    } else if (err.message === 'Insufficient funds in treasury wallet') {
      userErrorMessage = 'The treasury wallet does not have enough funds for this transfer.';
    } else if (err.message === 'Recipient wallet not found') {
      userErrorMessage = 'The recipient’s wallet could not be found.';
    } else if (err.message === 'Recipient user not found') {
      userErrorMessage = 'The recipient user could not be found.';
    } else if (err.message === 'This user type cannot receive bank transfers') {
      userErrorMessage = 'This user type is not eligible for bank transfers.';
    }
    res.status(500).json({ error: userErrorMessage });
  } finally {
    client.release();
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
    const result = await pool.query(`
      SELECT
        t.id,
        t.wallet_id,
        t.type,
        t.amount_cents,
        t.note,
        t.created_at,
        t.sender_id,
        t.recipient_id,
        CASE
          WHEN t.type = 'credit' THEN
            COALESCE(senders.first_name || ' ' || senders.last_name, 'Government Assistance')
          WHEN t.type = 'debit' THEN
            COALESCE(recipients.first_name || ' ' || recipients.last_name, 'Unknown Recipient')
          ELSE 'Unknown'
        END AS counterparty_name
      FROM transactions t
      LEFT JOIN users senders ON senders.id = t.sender_id
      LEFT JOIN users recipients ON recipients.id = t.recipient_id
      WHERE t.user_id = $1
      ORDER BY t.created_at DESC
      LIMIT $2 OFFSET $3
    `, [userId, limit, offset]);

    const countRes = await pool.query(
      `SELECT COUNT(*) FROM transactions WHERE user_id = $1`,
      [userId]
    );

    res.status(200).json({
      transactions: result.rows,
      totalCount: parseInt(countRes.rows[0].count, 10)
    });
  } catch (err) {
    console.error('❌ Failed to load user transactions:', err.message);
    res.status(500).json({ message: 'An error occurred while retrieving transactions.' });
  }
});

module.exports = router;
