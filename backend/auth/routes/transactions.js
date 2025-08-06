const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { authenticateToken } = require('../middleware/authMiddleware');

// 🔍 GET /api/transactions/recent (unchanged)
router.get('/recent', authenticateToken, async (req, res) => {
  const { role, type } = req.user;
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
        COALESCE(
          v.business_name,
          u.first_name || ' ' || u.last_name,
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
    res.status(500).json({ message: 'Failed to retrieve transactions.' });
  }
});

// 👤 GET /api/transactions/mine (unchanged)
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

// 📊 GET /api/transactions/report (unchanged)
router.get('/report', authenticateToken, async (req, res) => {
  const { role, type } = req.user;
  const { start, end, type: filterType } = req.query;
  if (role !== 'admin' || !['accountant', 'treasury'].includes(type)) {
    return res.status(403).json({ message: 'Unauthorized' });
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
          u.first_name || ' ' || u.last_name,
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
    res.status(500).json({ message: 'Failed to retrieve report transactions.' });
  }
});

// 💸 POST /api/transactions/add-funds
router.post('/add-funds', authenticateToken, async (req, res) => {
  const { role, type, id: adminId } = req.user;
  const { wallet_id, user_id, amount, note, added_by, treasury_wallet_id } = req.body;

  console.log('📥 Received add-funds request:', { wallet_id, user_id, amount, note, added_by, treasury_wallet_id });
  console.log('🧠 Auth user:', { role, type, adminId });
  console.log('🌐 DB config:', {
    user: pool.options.user,
    host: pool.options.host,
    database: pool.options.database,
    port: pool.options.port
  });

  if (role !== 'admin' || !['accountant', 'treasury'].includes(type)) {
    console.error('❌ Unauthorized access:', { role, type });
    return res.status(403).json({ error: 'Unauthorized' });
  }

  if (!wallet_id || !user_id || !amount || isNaN(amount) || amount <= 0 || !treasury_wallet_id) {
    console.error('❌ Invalid input:', { wallet_id, user_id, amount, note, added_by, treasury_wallet_id });
    return res.status(400).json({ error: 'Missing or invalid fields' });
  }

  if (added_by !== adminId) {
    console.error('❌ Mismatch in added_by:', { added_by, adminId });
    return res.status(403).json({ error: 'Invalid added_by: must match authenticated user' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const cents = Math.round(parseFloat(amount) * 100);
    console.log('🔢 Converted amount to cents:', cents);

    // Debug: Log treasury wallet query
    const treasuryQuery = `SELECT * FROM wallets WHERE id = $1`;
    console.log('🏦 Executing treasury wallet query:', treasuryQuery, { treasury_wallet_id });
    const treasuryWalletResult = await client.query(treasuryQuery, [treasury_wallet_id]);
    console.log('🏦 Treasury wallet query result:', {
      rowCount: treasuryWalletResult.rowCount,
      rows: treasuryWalletResult.rows
    });

    if (treasuryWalletResult.rowCount === 0) {
      console.error('❌ Treasury wallet not found:', treasury_wallet_id);
      throw new Error('Treasury wallet not found');
    }
    const treasuryWallet = treasuryWalletResult.rows[0];
    if (treasuryWallet.status !== 'active') {
      console.warn('⚠️ Treasury wallet not active:', { id: treasury_wallet_id, status: treasuryWallet.status });
      // Proceed for testing
    }
    console.log('🏦 Treasury wallet details:', treasuryWallet);

    // Debug: Log recipient wallet query
    const recipientQuery = `SELECT * FROM wallets WHERE id = $1 AND user_id = $2`;
    console.log('👤 Executing recipient wallet query:', recipientQuery, { wallet_id, user_id });
    const recipientWalletResult = await client.query(recipientQuery, [wallet_id, user_id]);
    console.log('👤 Recipient wallet query result:', {
      rowCount: recipientWalletResult.rowCount,
      rows: recipientWalletResult.rows
    });

    if (recipientWalletResult.rowCount === 0) {
      console.error('❌ Recipient wallet not found:', { wallet_id, user_id });
      throw new Error('Recipient wallet not found');
    }
    const recipientWallet = recipientWalletResult.rows[0];
    if (recipientWallet.status !== 'active') {
      console.error('❌ Recipient wallet not active:', { id: wallet_id, status: recipientWallet.status });
      throw new Error('Recipient wallet is not active');
    }
    console.log('👤 Recipient wallet details:', recipientWallet);

    // Validate balance
    if (treasuryWallet.balance < cents / 100) {
      console.error('❌ Insufficient funds in treasury wallet:', { balance: treasuryWallet.balance, required: cents / 100 });
      throw new Error('Insufficient funds in treasury wallet');
    }

    // Check recipient role restrictions
    const userRoleQuery = `SELECT role FROM users WHERE id = $1`;
    console.log('👤 Executing user role query:', userRoleQuery, { user_id });
    const userRoleResult = await client.query(userRoleQuery, [user_id]);
    console.log('👤 User role query result:', {
      rowCount: userRoleResult.rowCount,
      rows: userRoleResult.rows
    });

    const userRole = userRoleResult.rows[0]?.role;
    if (!userRole) {
      console.error('❌ User not found:', user_id);
      throw new Error('User not found');
    }
    if (userRole === 'student' || userRole === 'assistance') {
      if (note && note.toLowerCase().includes('transfer to bank')) {
        console.error('❌ Invalid note for user role:', { userRole, note });
        throw new Error('This user type cannot receive bank transfers');
      }
    }
    console.log('✅ User role validated:', userRole);

    // Deduct from treasury wallet
    await client.query(
      `UPDATE wallets SET balance = balance - $1 WHERE id = $2`,
      [cents / 100, treasury_wallet_id]
    );
    console.log('✅ Deducted from treasury wallet:', { amount: cents / 100, treasury_wallet_id });

    // Add to recipient's wallet
    await client.query(
      `UPDATE wallets SET balance = balance + $1 WHERE id = $2`,
      [cents / 100, wallet_id]
    );
    console.log('✅ Credited recipient wallet:', { amount: cents / 100, wallet_id });

    // Log treasury transaction (debit)
    await client.query(
      `INSERT INTO transactions (wallet_id, user_id, type, amount_cents, note, created_at, added_by, treasury_wallet_id)
       VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7)`,
      [treasury_wallet_id, treasuryWallet.user_id, 'debit', cents, note || `Fund transfer to user ${user_id}`, adminId, treasury_wallet_id]
    );
    console.log('✅ Logged treasury transaction (debit)');

    // Log recipient transaction (credit)
    await client.query(
      `INSERT INTO transactions (wallet_id, user_id, type, amount_cents, note, created_at, added_by, treasury_wallet_id)
       VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7)`,
      [wallet_id, user_id, 'credit', cents, note || `Funds received from treasury`, adminId, treasury_wallet_id]
    );
    console.log('✅ Logged recipient transaction (credit)');

    await client.query('COMMIT');
    console.log('✅ Transaction committed successfully');

    res.status(201).json({ success: true, message: 'Funds transferred successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to add funds:', err.message, err.stack);
    res.status(500).json({ error: err.message || 'Server error while adding funds' });
  } finally {
    client.release();
    console.log('🛠️ Database client released');
  }
});

// 📄 GET /api/transactions/user/:userId (unchanged)
router.get('/user/:userId', authenticateToken, async (req, res) => {
  const { role } = req.user;
  const { userId } = req.params;
  const limit = parseInt(req.query.limit) || 10;
  const offset = parseInt(req.query.offset) || 0;

  if (role !== 'admin') {
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
        COALESCE(
          v.business_name,
          TRIM(u.first_name || ' ' || u.last_name),
          'System'
        ) AS counterparty_name
      FROM transactions t
      LEFT JOIN vendors v ON v.id = t.vendor_id
      LEFT JOIN users u ON u.id = t.added_by
      WHERE t.user_id = $1
      ORDER BY t.created_at DESC
      LIMIT $2 OFFSET $3
    `, [userId, limit, offset]);

    const countRes = await pool.query(`
      SELECT COUNT(*) FROM transactions WHERE user_id = $1
    `, [userId]);

    res.status(200).json({
      transactions: result.rows,
      totalCount: parseInt(countRes.rows[0].count, 10)
    });
  } catch (err) {
    console.error('❌ Failed to load target user transactions:', err.message);
    res.status(500).json({ message: 'Failed to retrieve transactions.' });
  }
});

module.exports = router;
