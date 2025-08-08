// routes/transactions.js
const express = require('express');
const router = express.Router();

const pool = require('../../db'); // <-- your pg Pool
const { authenticateToken } = require('../middleware/authMiddleware'); // <-- your auth

// Helper fragment used in multiple queries to resolve names
const NAME_FIELDS_SQL = `
  t.sender_id,
  t.receiver_id,
  COALESCE(
    (sender.first_name || ' ' || COALESCE(sender.last_name, ''))::text,
    'Government Assistance'
  ) AS sender_name,
  COALESCE(
    (receiver.first_name || ' ' || COALESCE(receiver.last_name, ''))::text,
    'Unknown Recipient'
  ) AS receiver_name
`;

// 🔍 GET /api/transactions/recent  (admin: accountant/treasury)
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
      LEFT JOIN users sender   ON sender.id   = t.sender_id
      LEFT JOIN users receiver ON receiver.id = t.receiver_id
      ORDER BY t.created_at DESC
      LIMIT 50
    `);

    return res.status(200).json(rows);
  } catch (err) {
    console.error('❌ Failed to load transactions:', err);
    return res.status(500).json({ message: 'An error occurred while retrieving transactions.' });
  }
});

// 👤 GET /api/transactions/mine  (current user)
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
      LEFT JOIN users sender   ON sender.id   = t.sender_id
      LEFT JOIN users receiver ON receiver.id = t.receiver_id
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

// 📊 GET /api/transactions/report  (admin: accountant/treasury)
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
      LEFT JOIN users sender   ON sender.id   = t.sender_id
      LEFT JOIN users receiver ON receiver.id = t.receiver_id
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

// 📄 GET /api/transactions/user/:userId  (admin)
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
      LEFT JOIN users sender   ON sender.id   = t.sender_id
      LEFT JOIN users receiver ON receiver.id = t.receiver_id
      WHERE t.user_id = $1
      ORDER BY t.created_at DESC
      LIMIT $2 OFFSET $3
    `, [userId, limit, offset]);

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS count FROM transactions WHERE user_id = $1`,
      [userId]
    );

    // Optional: server-side logging to confirm names
    txRes.rows.forEach(row => {
      console.log(`🔁 TX ${row.id}: FROM ${row.sender_name} TO ${row.receiver_name} | $${(row.amount_cents / 100).toFixed(2)}`);
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

// 💰 POST /api/transactions/add-funds  (treasury/accountant action)
// Body: { wallet_id, user_id, amount, note, added_by, treasury_wallet_id }
router.post('/add-funds', authenticateToken, async (req, res) => {
  const { role, type } = req.user;
  if (role !== 'admin' || !['accountant', 'treasury'].includes(type)) {
    return res.status(403).json({ message: 'You do not have permission to add funds.' });
  }

  const client = await pool.connect();
  try {
    const { wallet_id, user_id, amount, note, added_by, treasury_wallet_id } = req.body;

    const amount_cents = Math.round(parseFloat(amount) * 100);
    const debitNote  = note || 'Funds issued';
    const creditNote = 'Received from Government Assistance';

    await client.query('BEGIN');

    // Who owns the treasury wallet? (we’ll mark them as sender)
    const treas = await client.query(
      `SELECT user_id FROM wallets WHERE id = $1`,
      [treasury_wallet_id]
    );
    if (treas.rowCount === 0) throw new Error('Treasury wallet not found');

    const treasuryUserId = treas.rows[0].user_id;

    // 1) Debit from Treasury wallet
    await client.query(
      `INSERT INTO transactions (
         wallet_id, user_id, type, amount_cents, note, created_at,
         added_by, sender_id, receiver_id
       )
       VALUES ($1, $2, 'debit', $3, $4, NOW(), $5, $6, $7)`,
      [
        treasury_wallet_id,           // wallet_id (treasury)
        treasuryUserId,               // user_id   (owner of treasury wallet)
        amount_cents,
        debitNote,
        added_by || req.user.id,      // record which admin did it
        treasuryUserId,               // sender = treasury user
        user_id                       // receiver = target user
      ]
    );

    // 2) Credit to Recipient's wallet
    await client.query(
      `INSERT INTO transactions (
         wallet_id, user_id, type, amount_cents, note, created_at,
         added_by, sender_id, receiver_id
       )
       VALUES ($1, $2, 'credit', $3, $4, NOW(), $5, $6, $7)`,
      [
        wallet_id,                    // wallet_id (recipient)
        user_id,                      // user_id   (recipient)
        amount_cents,
        creditNote,
        added_by || req.user.id,
        treasuryUserId,               // sender = treasury user (again, for clarity)
        user_id                       // receiver = recipient user
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
