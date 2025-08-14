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
/** COMPLETE — allow PATCH and POST (now actually moves money) */
async function doComplete(req, res) {
  const id = req.params.id;
  const me = req.user.userId || req.user.id;
  const { bank_reference, internal_note, treasury_wallet_id } = req.body || {};

  if (!treasury_wallet_id) {
    return res.status(400).json({ message: 'treasury_wallet_id is required.' });
  }
  if (!bank_reference || String(bank_reference).trim().length < 4) {
    return res.status(400).json({ message: 'bank_reference is required (min 4 chars).' });
  }

  // start tx
  await db.query('BEGIN');
  try {
    // 1) Lock the transfer
    const { rows: tRows } = await db.query(
      `
      SELECT id, user_id, amount_cents, status, claimed_by
      FROM transfers
      WHERE id = $1
      FOR UPDATE
      `,
      [id]
    );
    const t = tRows[0];
    if (!t) {
      await db.query('ROLLBACK');
      return res.status(404).json({ message: 'Transfer not found.' });
    }
    if (String(t.status).toLowerCase() !== 'claimed' || t.claimed_by !== me) {
      await db.query('ROLLBACK');
      return res.status(409).json({ message: 'Only the claimer can complete this transfer (must be in claimed state).' });
    }

    // 2) Lock user wallet
    const { rows: wRows } = await db.query(
      `
      SELECT id, COALESCE(balance_cents, balance) AS balance_cents
      FROM wallets
      WHERE user_id = $1
      FOR UPDATE
      `,
      [t.user_id]
    );
    const w = wRows[0];
    if (!w) {
      await db.query('ROLLBACK');
      return res.status(404).json({ message: 'User wallet not found.' });
    }

    // 3) Lock treasury wallet
    const { rows: twRows } = await db.query(
      `
      SELECT id, COALESCE(balance_cents, balance) AS balance_cents
      FROM treasury_wallets
      WHERE id = $1
      FOR UPDATE
      `,
      [treasury_wallet_id]
    );
    const tw = twRows[0];
    if (!tw) {
      await db.query('ROLLBACK');
      return res.status(404).json({ message: 'Treasury wallet not found.' });
    }

    const amt = Number(t.amount_cents || 0);
    if (!Number.isFinite(amt) || amt <= 0) {
      await db.query('ROLLBACK');
      return res.status(400).json({ message: 'Invalid transfer amount.' });
    }

    // 4) Balance checks (soft)
    if (Number(w.balance_cents) < amt) {
      await db.query('ROLLBACK');
      return res.status(400).json({ message: 'User balance is insufficient.' });
    }
    if (Number(tw.balance_cents) < amt) {
      await db.query('ROLLBACK');
      return res.status(400).json({ message: 'Treasury balance is insufficient.' });
    }

    // 5) Debit user wallet
    await db.query(
      `
      UPDATE wallets
      SET
        balance_cents = COALESCE(balance_cents, COALESCE(balance,0)) - $2,
        balance       = COALESCE(balance,       COALESCE(balance_cents,0)) - $2
      WHERE user_id = $1
      `,
      [t.user_id, amt]
    );

    // 6) Debit treasury wallet
    await db.query(
      `
      UPDATE treasury_wallets
      SET
        balance_cents = COALESCE(balance_cents, COALESCE(balance,0)) - $2,
        balance       = COALESCE(balance,       COALESCE(balance_cents,0)) - $2
      WHERE id = $1
      `,
      [treasury_wallet_id, amt]
    );

    // 7) (Optional) Insert a transaction record for audit
    //    Adjust columns/table name to match your existing transactions schema.
    await db.query(
      `
      INSERT INTO transactions
        (user_id, amount_cents, type, note, counterparty_name, created_at)
      VALUES
        ($1,     $2,           'debit', $3,   'Bank transfer', NOW())
      `,
      [t.user_id, amt, internal_note || 'Transfer to bank']
    );

    // 8) Mark transfer completed + store bank reference + treasury used
    await db.query(
      `
      UPDATE transfers
      SET status = 'completed',
          bank_reference = $2,
          treasury_wallet_id = $3,
          completed_at = NOW()
      WHERE id = $1
      `,
      [id, String(bank_reference).trim(), treasury_wallet_id]
    );

    await db.query('COMMIT');
    return res.json({
      ok: true,
      transfer: {
        id,
        status: 'completed',
        bank_reference: String(bank_reference).trim(),
        treasury_wallet_id
      }
    });
  } catch (e) {
    await db.query('ROLLBACK');
    console.error('complete transfer error', e);
    return res.status(500).json({ message: 'Failed to complete transfer.' });
  }
}
router.patch('/:id/complete', requireAccountsRole, wrap(doComplete));
router.post('/:id/complete',  requireAccountsRole, wrap(doComplete)); // POST alias

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

// --- Cardholder: create a new transfer request
router.post('/', async (req, res) => {
  try {
    const me = req.user || {};
    const role = (me.role || '').toLowerCase();
    const type = (me.type || '').toLowerCase();
    const userId = me.userId || me.id;

    // Allow cardholders (and assistance) to submit requests
    const isCardholder =
      role === 'cardholder' || type === 'cardholder' ||
      role === 'cardholder_assistance' || type === 'cardholder_assistance';

    if (!isCardholder) {
      return res.status(403).json({ message: 'Not authorized to submit transfers.' });
    }

    const { bank_account_id, amount_cents, memo = '' } = req.body || {};
    const amt = Number(amount_cents);

    if (!bank_account_id || !Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ message: 'Invalid bank account or amount.' });
    }

    // Verify the bank account belongs to this user
    const ba = await db.query(
      `
      SELECT
        bank_name AS bank,
        RIGHT(account_number, 4) AS last4
      FROM bank_accounts
      WHERE id = $1
        AND user_id = $2
        AND deleted_at IS NULL
      LIMIT 1
      `,
      [bank_account_id, userId]
    );

    if (!ba.rowCount) {
      return res.status(404).json({ message: 'Bank account not found.' });
    }

    const bank = ba.rows[0].bank;
    const last4 = String(ba.rows[0].last4 || '').slice(-4);
    const destination_masked = `${bank} •••• ${last4}`;

    // Soft balance check (wallets.balance is cents in your schema)
    try {
      const w = await db.query(
        `SELECT balance FROM wallets WHERE user_id = $1 LIMIT 1`,
        [userId]
      );
      const walletCents = Number(w.rows?.[0]?.balance || 0);
      if (!Number.isNaN(walletCents) && amt > walletCents) {
        return res.status(400).json({ message: 'Amount exceeds available balance.' });
      }
    } catch {
      // ignore soft check errors
    }

    // Insert the transfer (now includes memo) — make sure the table has a `memo` column
    const ins = await db.query(
      `
      INSERT INTO transfers (
        user_id, amount_cents, bank, destination_masked, status, requested_at, memo
      ) VALUES (
        $1, $2, $3, $4, 'pending', NOW(), $5
      )
      RETURNING
        id, user_id, amount_cents, bank, destination_masked, status,
        requested_at AS created_at
      `,
      [userId, amt, bank, destination_masked, memo]
    );

    return res.status(201).json({
      message: 'Transfer request submitted.',
      ...ins.rows[0]
    });
  } catch (e) {
    console.error('POST /api/transfers error:', e);
    return res.status(500).json({ message: 'Failed to submit transfer request.' });
  }
});


module.exports = router;
