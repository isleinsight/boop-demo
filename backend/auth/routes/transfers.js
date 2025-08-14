// backend/auth/routes/transfers.js
const express = require('express');
const router = express.Router();
const db = require('../../db');
const { authenticateToken } = require('../middleware/authMiddleware');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const CLAIM_TTL_MINUTES = 30;

// Try to obtain a dedicated client (works with common db helpers)
async function getClient() {
  if (db.pool && typeof db.pool.connect === 'function') {
    return db.pool.connect();
  }
  if (typeof db.connect === 'function') {
    return await db.connect();
  }
  // Fallback: emulate client with single-connection interface
  // (must support .query and .release no-ops)
  return {
    query: (...args) => db.query(...args),
    release: () => {}
  };
}

// Auto-release any claims older than TTL
async function releaseExpiredClaims() {
  try {
    await db.query(`
      UPDATE transfers
         SET status = 'pending',
             claimed_by = NULL,
             claimed_at = NULL
       WHERE status = 'claimed'
         AND claimed_at < NOW() - INTERVAL '${CLAIM_TTL_MINUTES} minutes'
    `);
  } catch (e) {
    console.warn('releaseExpiredClaims failed:', e.message || e);
  }
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
router.get('/ping', (req, res) => {
  res.json({ ok: true, message: 'Transfers route is alive' });
});

// ---------------------------------------------------------------------------
// Auth gate
// ---------------------------------------------------------------------------
router.use(authenticateToken);

function requireAccountsRole(req, res, next) {
  const { role, type } = req.user || {};
  if (role !== 'admin' || !['accountant', 'treasury', 'viewer'].includes((type || '').toLowerCase())) {
    return res.status(403).json({ message: 'Not authorized for transfers.' });
  }
  next();
}

// ---------------------------------------------------------------------------
// GET /api/transfers (admin list)
// Accepts: status, start, end, bank, limit, offset, or page/perPage
// Returns: { items, total }
// ---------------------------------------------------------------------------
router.get('/', requireAccountsRole, async (req, res) => {
  try {
    await releaseExpiredClaims();

    let {
      status = 'pending',
      start,
      end,
      bank,
      limit,
      offset,
      page,
      perPage
    } = req.query;

    // Support page/perPage from the UI
    if (perPage && !limit) limit = Number(perPage);
    if (page && !offset) {
      const p = Math.max(1, Number(page));
      const l = Math.max(1, Number(limit || 25));
      offset = (p - 1) * l;
    }
    limit = Math.max(1, Number(limit || 25));
    offset = Math.max(0, Number(offset || 0));

    const values = [];
    const where = [];

    if (status) {
      values.push(String(status).toLowerCase());
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
        t.requested_at AS created_at,     -- alias to match UI
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
        t.bank_reference,
        t.memo
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

// Small helper so POST and PATCH hit the same async fn
function wrap(handler) {
  return (req, res, next) => handler(req, res).catch(next);
}

// ---------------------------------------------------------------------------
// CLAIM
// ---------------------------------------------------------------------------
async function doClaim(req, res) {
  await releaseExpiredClaims();

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
router.post('/:id/claim',  requireAccountsRole, wrap(doClaim)); // alias

// ---------------------------------------------------------------------------
// RELEASE
// ---------------------------------------------------------------------------
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
router.post('/:id/release',  requireAccountsRole, wrap(doRelease)); // alias

// ---------------------------------------------------------------------------
// REJECT
// ---------------------------------------------------------------------------
async function doReject(req, res) {
  const id = req.params.id;
  const me = req.user.userId || req.user.id;
  const reason = (req.body?.reason || '').trim();

  // Allow reject if pending, or if claimed by me
  const { rows } = await db.query(
    `
    UPDATE transfers t
       SET status = 'rejected',
           claimed_by = NULL,
           claimed_at = NULL
     WHERE t.id = $1
       AND (
            t.status = 'pending'
            OR (t.status = 'claimed' AND t.claimed_by = $2)
       )
    RETURNING t.id, t.status;
    `,
    [id, me]
  );
  if (!rows.length) return res.status(409).json({ message: 'Cannot reject this transfer in its current state.' });

  // If you have a journal/audit table, insert reason here.
  // await db.query(`INSERT INTO transfer_notes ...`, [id, 'rejected', reason, me]);

  res.json({ ok: true, transfer: rows[0] });
}
router.patch('/:id/reject', requireAccountsRole, wrap(doReject));
router.post('/:id/reject',  requireAccountsRole, wrap(doReject)); // alias

// ---------------------------------------------------------------------------
// COMPLETE — atomic double debits (user + treasury) with strict checks
// ---------------------------------------------------------------------------
async function doComplete(req, res) {
  await releaseExpiredClaims();

  const id = req.params.id;
  const me = req.user.userId || req.user.id;
  const { bank_reference, internal_note, treasury_wallet_id } = req.body || {};

  if (!bank_reference || String(bank_reference).trim().length < 4) {
    return res.status(400).json({ message: 'bank_reference is required.' });
  }
  if (!treasury_wallet_id) {
    return res.status(400).json({ message: 'treasury_wallet_id is required.' });
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Lock the transfer row and validate ownership + freshness
    const { rows: trows } = await client.query(
      `
      SELECT id, user_id, amount_cents, status, claimed_by, claimed_at
        FROM transfers
       WHERE id = $1
       FOR UPDATE
      `,
      [id]
    );
    const t = trows[0];
    if (!t) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Transfer not found.' });
    }

    const isClaimedByMe = t.status === 'claimed' && String(t.claimed_by || '') === String(me || '');
    const fresh = t.claimed_at && (new Date(t.claimed_at) > new Date(Date.now() - CLAIM_TTL_MINUTES * 60 * 1000));
    if (!isClaimedByMe || !fresh) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Claim expired or not owned by you. Please claim again.' });
    }

    const amount = Number(t.amount_cents || 0);
    const userId = t.user_id;

    // 1) Debit user wallet (balance is in cents in your schema)
    const { rowCount: userUpd } = await client.query(
      `
      UPDATE wallets
         SET balance = balance - $1
       WHERE user_id = $2
         AND balance >= $1
      `,
      [amount, userId]
    );
    if (userUpd !== 1) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Insufficient user balance or wallet not found.' });
    }

    // 2) Debit treasury wallet
    const { rowCount: twUpd } = await client.query(
      `
      UPDATE treasury_wallets
         SET balance = balance - $1
       WHERE id = $2
         AND balance >= $1
      `,
      [amount, treasury_wallet_id]
    );
    if (twUpd !== 1) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Treasury has insufficient funds or not found.' });
    }

    // 3) (Optional) Journal entries here if you maintain a ledger

    // 4) Mark completed
    const { rows: done } = await client.query(
      `
      UPDATE transfers
         SET status = 'completed',
             bank_reference = $2,
             completed_at = NOW()
       WHERE id = $1
      RETURNING id, status, bank_reference, completed_at
      `,
      [id, String(bank_reference).trim()]
    );

    await client.query('COMMIT');
    return res.json({ ok: true, transfer: done[0] });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('doComplete error:', e);
    return res.status(500).json({ message: 'Failed to complete transfer.' });
  } finally {
    client.release && client.release();
  }
}
router.patch('/:id/complete', requireAccountsRole, wrap(doComplete));
router.post('/:id/complete',  requireAccountsRole, wrap(doComplete)); // alias

// ---------------------------------------------------------------------------
// Cardholder — latest request
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Cardholder — create new transfer request
// (Make sure your `transfers` table has a `memo` column if you want to persist it.)
// ---------------------------------------------------------------------------
router.post('/', async (req, res) => {
  try {
    const me = req.user || {};
    const role = (me.role || '').toLowerCase();
    const type = (me.type || '').toLowerCase();
    const userId = me.userId || me.id;

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

    // Verify bank account belongs to this user
    const ba = await db.query(
      `
      SELECT bank_name AS bank, RIGHT(account_number, 4) AS last4
        FROM bank_accounts
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
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

    // Soft balance check
    try {
      const w = await db.query(`SELECT balance FROM wallets WHERE user_id = $1 LIMIT 1`, [userId]);
      const walletCents = Number(w.rows?.[0]?.balance || 0);
      if (!Number.isNaN(walletCents) && amt > walletCents) {
        return res.status(400).json({ message: 'Amount exceeds available balance.' });
      }
    } catch {
      /* ignore soft check errors */
    }

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

    return res.status(201).json({ message: 'Transfer request submitted.', ...ins.rows[0] });
  } catch (e) {
    console.error('POST /api/transfers error:', e);
    return res.status(500).json({ message: 'Failed to submit transfer request.' });
  }
});

module.exports = router;
