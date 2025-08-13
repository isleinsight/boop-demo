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
  const { start, end, type: filterType, limit = 25, offset = 0 } = req.query;

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
    // Get total count for pagination
    const countResult = await pool.query(`
      SELECT COUNT(*) FROM transactions t
      LEFT JOIN users s ON s.id = t.sender_id
      LEFT JOIN users r ON r.id = t.recipient_id
      ${whereClause}
    `, values);
    const totalCount = parseInt(countResult.rows[0].count, 10);

    // Add limit/offset to values
    values.push(parseInt(limit, 10));
    values.push(parseInt(offset, 10));

    const { rows } = await pool.query(`
      SELECT
        t.id,
        t.type,
        t.amount_cents,
        t.note,
        t.created_at,
        COALESCE(s.first_name || ' ' || s.last_name, 'System') AS sender_name,
        COALESCE(r.first_name || ' ' || r.last_name, 'Unknown') AS recipient_name
      FROM transactions t
      LEFT JOIN users s ON s.id = t.sender_id
      LEFT JOIN users r ON r.id = t.recipient_id
      ${whereClause}
      ORDER BY t.created_at DESC
      LIMIT $${values.length - 1} OFFSET $${values.length}
    `, values);

    return res.status(200).json({
      transactions: rows,
      totalCount,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10)
    });
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

  // Permission: only admin accountants/treasury
  if (role !== 'admin' || !['accountant', 'treasury'].includes((type || '').toLowerCase())) {
    return res.status(403).json({ success: false, message: 'You do not have permission to add funds.' });
  }

  const { treasury_wallet_id, wallet_id, user_id, amount, note } = req.body || {};

  // Validate required fields
  if (!treasury_wallet_id || !wallet_id || !user_id || amount == null) {
    return res.status(400).json({ success: false, message: 'Missing required fields.' });
  }

  // Validate amount
  const amountNum = Number(amount);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    return res.status(400).json({ success: false, message: 'Invalid amount.' });
  }
  const amount_cents = Math.round(amountNum * 100);

  // Prevent self-transfer between same wallet
  if (String(treasury_wallet_id) === String(wallet_id)) {
    return res.status(400).json({ success: false, message: 'Treasury and recipient wallets must be different.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1) Load treasury wallet (and owner)
    const treasQ = await client.query(
      `SELECT id, user_id, balance
         FROM wallets
        WHERE id = $1
        FOR UPDATE`,
      [treasury_wallet_id]
    );
    if (!treasQ.rowCount) {
      throw new Error('Treasury wallet not found.');
    }
    const treasury = treasQ.rows[0];

    // 2) Load recipient wallet & verify ownership
    const recipQ = await client.query(
      `SELECT id, user_id, balance
         FROM wallets
        WHERE id = $1 AND user_id = $2
        FOR UPDATE`,
      [wallet_id, user_id]
    );
    if (!recipQ.rowCount) {
      throw new Error('Recipient wallet not found or does not belong to the specified user.');
    }
    const recipient = recipQ.rows[0];

    // (Optional) Enforce non-negative treasury balance
    // Comment this out if treasury is allowed to go negative.
    if (Number(treasury.balance) < amount_cents) {
      return res.status(400).json({ success: false, message: 'Insufficient treasury balance.' });
    }

    // 3) Insert debit transaction on treasury wallet
    const debitNote  = note || 'Funds issued';
    const debitTx = await client.query(
      `INSERT INTO transactions (
         wallet_id, user_id, type, amount_cents, note, created_at,
         added_by, sender_id, recipient_id
       ) VALUES ($1, $2, 'debit', $3, $4, NOW(),
                 $5, $6, $7)
       RETURNING id`,
      [
        treasury.id,             // wallet debited
        treasury.user_id,        // treasury owner
        amount_cents,
        debitNote,
        adminId,                 // which admin performed the action
        treasury.user_id,        // FROM
        recipient.user_id        // TO
      ]
    );

    // 4) Insert credit transaction on recipient wallet
    const creditNote = 'Received from Government Assistance';
    const creditTx = await client.query(
      `INSERT INTO transactions (
         wallet_id, user_id, type, amount_cents, note, created_at,
         added_by, sender_id, recipient_id
       ) VALUES ($1, $2, 'credit', $3, $4, NOW(),
                 $5, $6, $7)
       RETURNING id`,
      [
        recipient.id,            // wallet credited
        recipient.user_id,       // recipient user
        amount_cents,
        creditNote,
        adminId,
        treasury.user_id,        // FROM
        recipient.user_id        // TO
      ]
    );

    // 5) Update balances (use your existing `wallets.balance` column)
    const newTreasuryBal  = Number(treasury.balance)  - amount_cents;
    const newRecipientBal = Number(recipient.balance) + amount_cents;

    await client.query(
      `UPDATE wallets SET balance = $1 WHERE id = $2`,
      [newTreasuryBal, treasury.id]
    );

    await client.query(
      `UPDATE wallets SET balance = $1 WHERE id = $2`,
      [newRecipientBal, recipient.id]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: 'Funds added successfully',
      debit_tx_id:  debitTx.rows[0].id,
      credit_tx_id: creditTx.rows[0].id,
      balances: {
        treasury:  newTreasuryBal,   // cents
        recipient: newRecipientBal   // cents
      }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Add Funds Error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to add funds.' });
  } finally {
    client.release();
  }
});

module.exports = router;
