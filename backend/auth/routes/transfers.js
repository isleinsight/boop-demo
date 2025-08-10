// backend/auth/routes/transfers.js
const express = require('express');
const router = express.Router();
const db = require('../../db');                 // <— use your db helper
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
 * Query: status=pending|claimed|completed|rejected (default pending)
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

    // total
    const countSql = `SELECT COUNT(*)::int AS total FROM transfers t ${whereSql};`;
    const { rows: countRows } = await db.query(countSql, values);
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
        cb.first_name || ' ' || cb.last_name AS claimed_by_name,
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
    const { rows: items } = await db.query(listSql, values);

    res.json({ items, total });
  } catch (err) {
    console.error('❌ transfers list error:', err);
    res.status(500).json({ message: 'Failed to load transfers.' });
  }
});

/** helper so POST and PATCH hit the same logic */
function wrap(handler) {
  return (req, res, next) => handler(req, res).catch(next);
}

/** CLAIM — allow PATCH and POST (front-end currently sends POST) */
async function doClaim(req, res) {
  const id = req.params.id;
  const me = req.user.userId || req.user.id;

  const { rows } = await db.query(
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
  if (!rows.length) return res.status(409).json({ message: 'Transfer is not available to claim.' });
  res.json({ ok: true, transfer: rows[0] });
}
router.patch('/:id/claim', requireAccountsRole, wrap(doClaim));
router.post('/:id/claim',  requireAccountsRole, wrap(doClaim));  // <— POST alias

/** RELEASE — allow PATCH and POST */
async function doRelease(req, res) {
  const id = req.params.id;
  const me = req.user.userId || req.user.id;

  const { rows } = await db.query(
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
  if (!rows.length) return res.status(409).json({ message: 'Only the claimer can release this transfer.' });
  res.json({ ok: true, transfer: rows[0] });
}
router.patch('/:id/release', requireAccountsRole, wrap(doRelease));
router.post('/:id/release',  requireAccountsRole, wrap(doRelease)); // <— POST alias

/** COMPLETE — allow PATCH and POST */
async function doComplete(req, res) {
  const id = req.params.id;
  const me = req.user.userId || req.user.id;
  const { bank_reference, internal_note, treasury_wallet_id } = req.body || {};
  if (!bank_reference || String(bank_reference).trim().length < 4) {
    return res.status(400).json({ message: 'bank_reference is required.' });
  }

  // (optional) you can log internal_note / treasury_wallet_id in a journal table

  const { rows } = await db.query(
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
}
router.patch('/:id/complete', requireAccountsRole, wrap(doComplete));
router.post('/:id/complete',  requireAccountsRole, wrap(doComplete)); // <— POST alias

// --- Cardholder view: latest request
router.get('/mine/latest', async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;

    const { rows } = await db.query(
      `
      SELECT
        id,
        requested_at AS created_at,
        status,
        amount_cents
      FROM transfers
      WHERE user_id = $1
      ORDER BY requested_at DESC
      LIMIT 1
      `,
      [userId]
    );

    if (!rows.length) return res.json({});
    res.json(rows[0]);
  } catch (e) {
    console.error('transfers/mine/latest error', e);
    res.status(500).json({ message: 'Failed to load latest transfer.' });
  }
});

module.exports = router;
