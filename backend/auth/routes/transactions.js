// backend/auth/routes/transactions.js
const express = require('express');
const router = express.Router();

const pool = require('../../db');
const { authenticateToken } = require('../middleware/authMiddleware');

// --- presentation helpers ---------------------------------------------------
function safeMeta(tx) {
  try {
    return typeof tx.metadata === 'string'
      ? JSON.parse(tx.metadata)
      : (tx.metadata || {});
  } catch {
    return {};
  }
}

function computeToDisplay(tx) {
  // Prefer the masked destination saved during transfer completion
  const m = safeMeta(tx);
  if (m.to_mask) return m.to_mask;               // set by transfers.doComplete()

  // Prefer vendor business name when present
  if (tx.vendor_business_name) return tx.vendor_business_name;

  // Fallbacks you already select via JOINs:
  if (tx.recipient_name) return tx.recipient_name;
  if (tx.counterparty_name) return tx.counterparty_name;
  return '';
}

function computeFromDisplay(tx) {
  // You already select sender_name via NAME_FIELDS_SQL
  if (tx.sender_name) return tx.sender_name;
  return '';
}

function decorateTx(rows) {
  return rows.map(r => ({
    ...r,
    to_display: computeToDisplay(r),
    from_display: computeFromDisplay(r),
  }));
}

/**
 * Names from users + a counterparty_name with vendor awareness
 * - If it's a vendor sale (t.vendor_id IS NOT NULL) → use v.business_name
 * - Else fall back to other party's full name (existing behavior)
 */
const NAME_FIELDS_SQL = `
  t.sender_id,
  t.recipient_id,
  (COALESCE(s.first_name,'') || ' ' || COALESCE(s.last_name,''))::text AS sender_name,
  (COALESCE(r.first_name,'') || ' ' || COALESCE(r.last_name,''))::text AS recipient_name,
  CASE
    WHEN t.vendor_id IS NOT NULL
      THEN COALESCE(v.business_name, 'Vendor')
    WHEN t.type = 'debit'
      THEN (COALESCE(r.first_name,'') || ' ' || COALESCE(r.last_name,''))
    WHEN t.type = 'credit'
      THEN (COALESCE(s.first_name,'') || ' ' || COALESCE(s.last_name,''))
    ELSE (COALESCE(s.first_name,'') || ' ' || COALESCE(s.last_name,''))
  END::text AS counterparty_name
`;

/**
 * Universal to_display with smart fallbacks:
 * 1) If vendor sale → v.business_name
 * 2) recipient full name (if recipient_id present)
 * 3) transfers.destination_masked (if bank transfer + linked transfer)
 * 4) metadata.transfer_to_display (completion-time override)
 * 5) empty string
 */
const TO_DISPLAY_SQL = `
  CASE
    WHEN t.vendor_id IS NOT NULL
      THEN COALESCE(v.business_name, 'Vendor')
    WHEN t.recipient_id IS NOT NULL
      THEN (COALESCE(r.first_name,'') || ' ' || COALESCE(r.last_name,''))
    WHEN tr.destination_masked IS NOT NULL AND t.method = 'bank'
      THEN tr.destination_masked
    WHEN t.metadata ? 'transfer_to_display'
      THEN t.metadata->>'transfer_to_display'
    ELSE ''
  END::text AS to_display,
  -- expose vendor name separately so the decorator can prefer it
  COALESCE(v.business_name, NULL)::text AS vendor_business_name
`;

// Joins we reuse
const TRANSFER_JOIN_SQL = `LEFT JOIN transfers tr ON tr.id = t.transfer_id`;
const VENDOR_JOIN_SQL   = `LEFT JOIN vendors   v ON v.id = t.vendor_id`;

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
        ${NAME_FIELDS_SQL},
        ${TO_DISPLAY_SQL}
      FROM transactions t
      LEFT JOIN users s ON s.id = t.sender_id
      LEFT JOIN users r ON r.id = t.recipient_id
      ${VENDOR_JOIN_SQL}
      ${TRANSFER_JOIN_SQL}
      ORDER BY t.created_at DESC
      LIMIT 50
    `);
    return res.status(200).json(decorateTx(rows));
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
        ${NAME_FIELDS_SQL},
        ${TO_DISPLAY_SQL}
      FROM transactions t
      LEFT JOIN users s ON s.id = t.sender_id
      LEFT JOIN users r ON r.id = t.recipient_id
      ${VENDOR_JOIN_SQL}
      ${TRANSFER_JOIN_SQL}
      WHERE t.user_id = $1
      ORDER BY t.created_at DESC
      LIMIT 50
    `, [userId]);

    return res.status(200).json(decorateTx(rows));
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
      ${VENDOR_JOIN_SQL}
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
        COALESCE(r.first_name || ' ' || r.last_name, 'Unknown') AS recipient_name,
        ${TO_DISPLAY_SQL}
      FROM transactions t
      LEFT JOIN users s ON s.id = t.sender_id
      LEFT JOIN users r ON r.id = t.recipient_id
      ${VENDOR_JOIN_SQL}
      ${TRANSFER_JOIN_SQL}
      ${whereClause}
      ORDER BY t.created_at DESC
      LIMIT $${values.length - 1} OFFSET $${values.length}
    `, values);

    return res.status(200).json({
      transactions: decorateTx(rows),
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
  const callerId = req.user?.userId ?? req.user?.id;
  const role = (req.user?.role || '').toLowerCase();
  const { userId } = req.params;
  const limit  = parseInt(req.query.limit, 10)  || 50;
  const offset = parseInt(req.query.offset, 10) || 0;

  // authorize: admin OR (same user) OR (parent linked to that student)
  let allowed = role === 'admin' || String(callerId) === String(userId);
  if (!allowed && role === 'parent') {
    const link = await pool.query(
      `SELECT 1 FROM student_parents WHERE student_id = $1 AND parent_id = $2 LIMIT 1`,
      [userId, callerId]
    );
    allowed = link.rowCount > 0;
  }
  if (!allowed) return res.status(403).json({ message: 'Not authorized for this student.' });

  try {
    const txRes = await pool.query(`
      SELECT
        t.id,
        t.wallet_id,
        t.user_id,
        t.type,
        t.amount_cents,
        t.note,
        t.method,
        t.category,
        t.created_at,
        ${NAME_FIELDS_SQL},
        ${TO_DISPLAY_SQL}
      FROM transactions t
      LEFT JOIN users s ON s.id = t.sender_id
      LEFT JOIN users r ON r.id = t.recipient_id
      ${VENDOR_JOIN_SQL}
      ${TRANSFER_JOIN_SQL}
      WHERE t.user_id = $1
      ORDER BY t.created_at DESC
      LIMIT $2 OFFSET $3
    `, [userId, limit, offset]);

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS count FROM transactions WHERE user_id = $1`,
      [userId]
    );

    return res.status(200).json({
      transactions: decorateTx(txRes.rows),
      totalCount: countRes.rows[0].count,
      limit, offset
    });
  } catch (err) {
    console.error('❌ Failed to load target user transactions:', err);
    return res.status(500).json({ message: 'An error occurred while retrieving transactions.' });
  }
});

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

    // Verify treasury wallet exists
    const treas = await client.query(
      `SELECT id, user_id FROM wallets WHERE id = $1`,
      [treasury_wallet_id]
    );
    if (!treas.rowCount) throw new Error('Treasury wallet not found');
    const treasuryUserId = treas.rows[0].user_id;

    // Verify recipient wallet
    const recip = await client.query(
      `SELECT id FROM wallets WHERE id = $1 AND user_id = $2`,
      [wallet_id, user_id]
    );
    if (!recip.rowCount) throw new Error('Recipient wallet does not belong to user');

    // 1) Debit from treasury wallet
    await client.query(
      `INSERT INTO transactions (
         wallet_id, user_id, type, amount_cents, note, created_at,
         added_by, sender_id, recipient_id
       )
       VALUES ($1, $2, 'debit', $3, $4, NOW(), $5, $6, $7)`,
      [treasury_wallet_id, treasuryUserId, amount_cents, debitNote, adminId, treasuryUserId, user_id]
    );

    // 2) Credit to recipient wallet
    await client.query(
      `INSERT INTO transactions (
         wallet_id, user_id, type, amount_cents, note, created_at,
         added_by, sender_id, recipient_id
       )
       VALUES ($1, $2, 'credit', $3, $4, NOW(), $5, $6, $7)`,
      [wallet_id, user_id, amount_cents, creditNote, adminId, treasuryUserId, user_id]
    );

    // 3) Update wallet balances
    await client.query(
      `UPDATE wallets SET balance = balance - $1 WHERE id = $2`,
      [amount_cents, treasury_wallet_id]
    );
    await client.query(
      `UPDATE wallets SET balance = balance + $1 WHERE id = $2`,
      [amount_cents, wallet_id]
    );

    await client.query('COMMIT');
    return res.status(200).json({
      success: true,
      message: `✅ Funds added successfully: $${(amount_cents / 100).toFixed(2)}`
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Add Funds Error:', err);
    return res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
