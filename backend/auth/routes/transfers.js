// backend/auth/routes/transfers.js
const express = require('express');
const router = express.Router();
const pool = require('../../db'); // adjust if your pool is exported elsewhere
const { authenticateToken } = require('../middleware/authMiddleware');

// --- Health ---
router.get('/ping', (req, res) => {
  res.json({ ok: true, message: 'Transfers route is alive' });
});

// --- Auth gate for everything below ---
router.use(authenticateToken);

// Only allow admin + (accountant/treasury/viewer) to access transfers admin
function requireAccountsRole(req, res, next) {
  const { role, type } = req.user || {};
  if (role !== 'admin' || !['accountant', 'treasury', 'viewer'].includes((type || '').toLowerCase())) {
    return res.status(403).json({ message: 'Not authorized for transfers.' });
  }
  next();
}

/**
 * GET /api/transfers
 * Query: status=pending|claimed|completed (default pending)
 *        start=YYYY-MM-DD, end=YYYY-MM-DD, bank=HSBC|BUTTERFIELD
 *        limit=25, offset=0
 * Returns: { items: [...], total: number }
 */
router.get('/', requireAccountsRole, async (req, res) => {
  try {
    const {
      status = 'pending',
      start,
      end,
      bank,
      limit = 25,
      offset = 0,
    } = req.query;

    const values = [];
    const where = [];

    if (status) {
      values.push(status.toLowerCase());
      where.push(`t.status = $${values.length}`);
    }

    if (start) {
      values.push(start);
      where.push(`t.requested_at >= $${values.length}`);
    }
    if (end) {
      values.push(end);
      where.push(`t.requested_at <= $${values.length}`);
    }
    if (bank) {
      values.push(bank);
      where.push(`t.bank = $${values.length}`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    // total count
    const countSql = `SELECT COUNT(*)::int AS total FROM transfers t ${whereSql};`;
    const { rows: countRows } = await pool.query(countSql, values);
    const total = countRows[0]?.total || 0;

    // page
    values.push(Number(limit), Number(offset));
    const listSql = `
      SELECT
        t.id,
        t.requested_at,
        t.user_id,
        u.first_name || ' ' || u.last_name AS cardholder_name,
        u.email AS cardholder_email,
        t.amount_cents,
        t.bank,
        t.destination_masked,
        t.status,
        t.claimed_by,
        cb.email AS claimed_by_email,
        t.claimed_at,
        t.completed_at,
        t.bank_reference
      FROM transfers t
      LEFT JOIN users u  ON u.id = t.user_id
      LEFT JOIN users cb ON cb.id = t.claimed_by
      ${whereSql}
      ORDER BY t.requested_at DESC
      LIMIT $${values.length-1} OFFSET $${values.length};
    `;
    const { rows: items } = await pool.query(listSql, values);

    res.json({ items, total });
  } catch (err) {
    console.error('❌ transfers list error:', err);
    res.status(500).json({ message: 'Failed to load transfers.' });
  }
});

/**
 * PATCH /api/transfers/:id/claim
 * Body: none
 * Locks the transfer to this accountant (only if still pending or already claimed by them)
 */
router.patch('/:id/claim', requireAccountsRole, async (req, res) => {
  const id = req.params.id;
  const me = req.user.userId || req.user.id;

  try {
    // Lock row if pending OR already claimed by me
    const { rows } = await pool.query(
      `
      UPDATE transfers t
      SET status = 'claimed',
          claimed_by = $2,
          claimed_at = NOW()
      WHERE t.id = $1
        AND (t.status = 'pending' OR (t.status = 'claimed' AND t.claimed_by = $2))
      RETURNING t.id, t.status, t.claimed_by, t.claimed_at;
      `,
      [id, me]
    );

    if (!rows.length) {
      return res.status(409).json({ message: 'Transfer is not available to claim.' });
    }

    res.json({ ok: true, transfer: rows[0] });
  } catch (err) {
    console.error('❌ claim error:', err);
    res.status(500).json({ message: 'Failed to claim transfer.' });
  }
});

/**
 * PATCH /api/transfers/:id/release
 * Body: none
 * Unlock a claimed transfer (only by the same user who claimed it and still not completed)
 */
router.patch('/:id/release', requireAccountsRole, async (req, res) => {
  const id = req.params.id;
  const me = req.user.userId || req.user.id;

  try {
    const { rows } = await pool.query(
      `
      UPDATE transfers t
      SET status = 'pending',
          claimed_by = NULL,
          claimed_at = NULL
      WHERE t.id = $1
        AND t.status = 'claimed'
        AND t.claimed_by = $2
      RETURNING t.id, t.status;
      `,
      [id, me]
    );

    if (!rows.length) {
      return res.status(409).json({ message: 'Only the claimer can release this transfer.' });
    }

    res.json({ ok: true, transfer: rows[0] });
  } catch (err) {
    console.error('❌ release error:', err);
    res.status(500).json({ message: 'Failed to release transfer.' });
  }
});

/**
 * PATCH /api/transfers/:id/complete
 * Body: { bank_reference: string }
 * Marks as completed, stores reference & completed_at. Only the claimer can complete.
 */
router.patch('/:id/complete', requireAccountsRole, async (req, res) => {
  const id = req.params.id;
  const me = req.user.userId || req.user.id;
  const { bank_reference } = req.body || {};

  if (!bank_reference || String(bank_reference).trim().length < 4) {
    return res.status(400).json({ message: 'bank_reference is required.' });
  }

  try {
    const { rows } = await pool.query(
      `
      UPDATE transfers t
      SET status = 'completed',
          bank_reference = $3,
          completed_at = NOW()
      WHERE t.id = $1
        AND t.status = 'claimed'
        AND t.claimed_by = $2
      RETURNING t.id, t.status, t.bank_reference, t.completed_at;
      `,
      [id, me, bank_reference.trim()]
    );

    if (!rows.length) {
      return res.status(409).json({ message: 'Only the claimer can complete this transfer (or it is not in claimed state).' });
    }

    res.json({ ok: true, transfer: rows[0] });
  } catch (err) {
    console.error('❌ complete error:', err);
    res.status(500).json({ message: 'Failed to complete transfer.' });
  }
});

module.exports = router;
