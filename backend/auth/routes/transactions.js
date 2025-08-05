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

// 💸 POST /api/transactions/add-funds (modified)
// 💸 POST /api/transactions/add-funds
router.post('/add-funds', authenticateToken, async (req, res) => {
  const { role, type, id: adminId } = req.user;
  const { wallet_id, amount, note, user_id, treasury_wallet_id } = req.body;

  if (role !== 'admin' || !['accountant', 'treasury'].includes(type)) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  if (!wallet_id || !amount || isNaN(amount) || amount <= 0 || !user_id || !treasury_wallet_id) {
    return res.status(400).json({ error: 'Missing or invalid fields' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const cents = Math.round(parseFloat(amount) * 100);

    // Get treasury wallet (selected by accountant or treasury user's own wallet)
    const treasuryWalletResult = await client.query(
      `SELECT * FROM wallets WHERE id = $1 AND status = $2 FOR UPDATE`,
      [treasury_wallet_id, 'active']
    );
    if (treasuryWalletResult.rows.length === 0) {
      throw new Error('Treasury wallet not found');
    }
    const treasuryWallet = treasuryWalletResult.rows[0];

    // Get recipient's wallet (user, student, or senior)
    const recipientWalletResult = await client.query(
      `SELECT * FROM wallets WHERE id = $1 AND user_id = $2 AND status = $3 FOR UPDATE`,
      [wallet_id, user_id, 'active']
    );
    if (recipientWalletResult.rows.length === 0) {
      throw new Error('Recipient wallet not found');
    }
    const recipientWallet = recipientWalletResult.rows[0];

    // Validate balance and role-specific rules
    if (treasuryWallet.balance < cents / 100) {
      throw new Error('Insufficient funds in treasury wallet');
    }

    // Check recipient role restrictions (e.g., students/assistance can't receive transfers)
    const userRoleResult = await client.query(
      `SELECT role FROM users WHERE id = $1`,
      [user_id]
    );
    const userRole = userRoleResult.rows[0]?.role;
    if (userRole === 'student' || userRole === 'assistance') {
      // Only allow funding, not transfers to banks
      if (note && note.toLowerCase().includes('transfer to bank')) {
        throw new Error('This user type cannot receive bank transfers');
      }
    }

    // Deduct from treasury wallet
    await client.query(
      `UPDATE wallets SET balance = balance - $1 WHERE id = $2`,
      [cents / 100, treasury_wallet_id]
    );

    // Add to recipient's wallet
    await client.query(
      `UPDATE wallets SET balance = balance + $1 WHERE id = $2`,
      [cents / 100, wallet_id]
    );

    // Log treasury transaction (debit)
    await client.query(
      `INSERT INTO transactions (wallet_id, user_id, type, amount_cents, note, created_at, added_by)
       VALUES ($1, $2, 'debit', $3, $4, NOW(), $5)`,
      [treasury_wallet_id, adminId, cents, note || `Fund transfer to user ${user_id}`, adminId]
    );

    // Log recipient transaction (credit)
    await client.query(
      `INSERT INTO transactions (wallet_id, user_id, type, amount_cents, note, created_at, added_by)
       VALUES ($1, $2, 'credit', $3, $4, NOW(), $5)`,
      [wallet_id, user_id, cents, note || `Funds received from treasury`, adminId]
    );

    await client.query('COMMIT');

    res.status(201).json({ success: true, message: 'Funds transferred successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to add funds:', err.message);
    res.status(500).json({ error: err.message || 'Server error while adding funds' });
  } finally {
    client.release();
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
