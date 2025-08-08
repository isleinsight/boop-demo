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

  console.log('🔁 Incoming add-funds request:', {
    role, type, adminId, wallet_id, user_id, amount, note, added_by
  });

  if (role !== 'admin' || !['accountant', 'treasury'].includes(type)) {
    console.warn('❌ Unauthorized access attempt');
    return res.status(403).json({ error: 'Unauthorized' });
  }

  if (!wallet_id || !user_id || !amount || isNaN(amount) || amount <= 0) {
    console.warn('❌ Invalid input:', { wallet_id, user_id, amount });
    return res.status(400).json({ error: 'Missing or invalid fields' });
  }

  if (added_by !== adminId) {
    console.warn('❌ added_by does not match authenticated admin');
    return res.status(403).json({ error: 'Invalid added_by' });
  }

  const transferAmount = parseFloat(amount);
  const amount_cents = Math.round(transferAmount * 100);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Treasury Wallet
    const { rows: treasuryRows } = await client.query(
      `SELECT * FROM wallets WHERE id = $1`, [wallet_id]
    );
    if (!treasuryRows.length) throw new Error('Treasury wallet not found');
    const treasuryWallet = treasuryRows[0];
    console.log('✅ Treasury wallet found:', treasuryWallet);

    if (parseFloat(treasuryWallet.balance) < transferAmount) {
      throw new Error('Insufficient funds');
    }

    // Recipient Wallet
    const { rows: recipientRows } = await client.query(
      `SELECT * FROM wallets WHERE user_id = $1`, [user_id]
    );
    if (!recipientRows.length) throw new Error('Recipient wallet not found');
    const recipientWallet = recipientRows[0];
    console.log('✅ Recipient wallet found:', recipientWallet);

    // Recipient User
    const { rows: userRows } = await client.query(
      `SELECT role, first_name, last_name FROM users WHERE id = $1`, [user_id]
    );
    const userRole = userRows[0]?.role;
    console.log('👤 Recipient user info:', userRows[0]);

    if (!userRole) throw new Error('User not found');
    if (['student', 'assistance'].includes(userRole) && note?.toLowerCase().includes('transfer to bank')) {
      throw new Error('This user type cannot receive bank transfers');
    }

    // Adjust balances
    await client.query(`UPDATE wallets SET balance = balance - $1 WHERE id = $2`, [transferAmount, treasuryWallet.id]);
    await client.query(`UPDATE wallets SET balance = balance + $1 WHERE id = $2`, [transferAmount, recipientWallet.id]);
    console.log(`💰 Transferred $${transferAmount} from treasury to recipient`);

    const debitNote = note ? `${note} [user_id:${user_id}]` : `Fund transfer to user ${user_id} [user_id:${user_id}]`;

    // Debit transaction
    const debitResult = await client.query(
      `INSERT INTO transactions (
         wallet_id, user_id, type, amount_cents, note, created_at, added_by, sender_id, recipient_id
       ) VALUES ($1, $2, 'debit', $3, $4, NOW(), $5, $6, $7) RETURNING *`,
      [treasuryWallet.id, treasuryWallet.user_id, amount_cents, debitNote, adminId, treasuryWallet.user_id, user_id]
    );
    console.log('📝 Debit transaction inserted:', debitResult.rows[0]);

    // Credit transaction
    const creditResult = await client.query(
      `INSERT INTO transactions (
         wallet_id, user_id, type, amount_cents, note, created_at, added_by, sender_id, recipient_id
       ) VALUES ($1, $2, 'credit', $3, 'Received from Government Assistance', NOW(), NULL, $4, $2) RETURNING *`,
      [recipientWallet.id, user_id, amount_cents, treasuryWallet.user_id]
    );
    console.log('📝 Credit transaction inserted:', creditResult.rows[0]);

    await client.query('COMMIT');
    res.status(201).json({ success: true, message: 'Funds transferred successfully' });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error during add-funds:', err.message);
    res.status(500).json({ error: err.message });
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

  console.log(`📥 Fetching transactions for user ${userId} with limit ${limit} and offset ${offset}`);

  if (role !== 'admin') {
    console.warn('❌ Unauthorized access to user transactions');
    return res.status(403).json({ message: 'Unauthorized' });
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
            CASE
              WHEN t.sender_id IS NULL THEN 'Government Assistance'
              ELSE COALESCE(sender.first_name || ' ' || sender.last_name, 'Unknown Sender')
            END
          WHEN t.type = 'debit' THEN
            COALESCE(recipient.first_name || ' ' || recipient.last_name, 'Unknown Recipient')
          ELSE 'Unknown'
        END AS counterparty_name
      FROM transactions t
      LEFT JOIN users sender ON sender.id = t.sender_id
      LEFT JOIN users recipient ON recipient.id = t.recipient_id
      WHERE t.user_id = $1
      ORDER BY t.created_at DESC
      LIMIT $2 OFFSET $3
    `, [userId, limit, offset]);

    console.log(`📦 Loaded ${result.rows.length} transactions`);

    result.rows.forEach((row, index) => {
      console.log(`[${index + 1}] Transaction ID: ${row.id}, Type: ${row.type}, Sender ID: ${row.sender_id}, Recipient ID: ${row.recipient_id}, Counterparty: ${row.counterparty_name}`);
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
    console.error('❌ Error loading transactions:', err.message);
    res.status(500).json({ message: 'Error loading transactions.' });
  }
});

module.exports = router;
