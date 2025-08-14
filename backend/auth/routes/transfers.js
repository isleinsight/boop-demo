// backend/auth/routes/transfers.js
const express = require('express');
const router = express.Router();
const db = require('../../db');
const { authenticateToken } = require('../middleware/authMiddleware');

// --- Claim TTL (minutes)
const CLAIM_TTL_MINUTES = 30;

// Helper to obtain a client for transactions
async function getDbClient() {
  if (db?.pool?.connect) return db.pool.connect();
  if (typeof db.getClient === 'function') return db.getClient();
  if (typeof db.connect === 'function') return db.connect();
  throw new Error('DB client access not available; expose pool.connect() / getClient() on your db helper.');
}

// Release any claims older than the TTL
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
    console.warn('releaseExpiredClaims failed', e.message || e);
  }
}

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
 *        start=YYYY-MM-DD, end=YYYY-MM-DD, bank=HSBC|Butterfield
 *        limit=25, offset=0
 * Returns: { items: [...], total: number }
 *
 * Note: API returns `requested_at` (canonical) AND a compatibility mirror `created_at`.
 */
router.get('/', requireAccountsRole, async (req, res) => {
  try {
    await releaseExpiredClaims();

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
        t.requested_at,               -- canonical timestamp
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
    const { rows: itemsRaw } = await db.query(listSql, values);

    // Add created_at mirror for backward compatibility
    const items = itemsRaw.map(r => ({ ...r, created_at: r.requested_at }));

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

/** CLAIM — allow PATCH and POST (front-end may send POST) */
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
    RETURNING t.id, t.status, t.claimed_by, t.claimed_at
    `,
    [id, me]
  );
  if (!rows.length) return res.status(409).json({ message: 'Transfer is not available to claim.' });
  res.json({ ok: true, transfer: rows[0] });
}
router.patch('/:id/claim', requireAccountsRole, wrap(doClaim));
router.post('/:id/claim',  requireAccountsRole, wrap(doClaim));  // POST alias

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
    RETURNING t.id, t.status
    `,
    [id, me]
  );
  if (!rows.length) return res.status(409).json({ message: 'Only the claimer can release this transfer.' });
  res.json({ ok: true, transfer: rows[0] });
}
router.patch('/:id/release', requireAccountsRole, wrap(doRelease));
router.post('/:id/release',  requireAccountsRole, wrap(doRelease)); // POST alias

/** REJECT — allow PATCH and POST (admin only; if claimed, only claimer or any admin? keep simple: any admin) */
async function doReject(req, res) {
  const id = req.params.id;
  const reason = (req.body?.reason || '').slice(0, 255); // optional, keep short
  const { rows } = await db.query(
    `
    UPDATE transfers
       SET status = 'rejected',
           claimed_by = NULL,
           claimed_at = NULL
     WHERE id = $1
       AND status IN ('pending','claimed')
    RETURNING id, status
    `,
    [id]
  );
  if (!rows.length) return res.status(409).json({ message: 'Transfer is not eligible to reject.' });

  // Optional: store reason in a notes table or column if you have one.

  res.json({ ok: true, transfer: rows[0] });
}
router.patch('/:id/reject', requireAccountsRole, wrap(doReject));
router.post('/:id/reject',  requireAccountsRole, wrap(doReject)); // POST alias

/** COMPLETE — atomic debits + double-entry transactions */
async function doComplete(req, res) {
  const id = req.params.id; // transfer id
  const me = req.user.userId || req.user.id;
  const { bank_reference, internal_note, treasury_wallet_id } = req.body || {};

  if (!bank_reference || String(bank_reference).trim().length < 4) {
    return res.status(400).json({ message: 'bank_reference is required.' });
  }
  if (!treasury_wallet_id) {
    return res.status(400).json({ message: 'treasury_wallet_id is required.' });
  }

  await releaseExpiredClaims();

  // get a dedicated client so all statements are in the same txn
  const client = await (db.pool?.connect ? db.pool.connect() : db.connect?.());
  if (!client) return res.status(500).json({ message: 'DB connection unavailable' });

  try {
    await client.query('BEGIN');

    // 1) Lock transfer and validate claim freshness/ownership
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
    const isMine = t.status === 'claimed' && String(t.claimed_by) === String(me);
    const stillFresh =
      t.claimed_at && (new Date(t.claimed_at) > new Date(Date.now() - CLAIM_TTL_MINUTES * 60 * 1000));
    if (!isMine || !stillFresh) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Claim expired or not owned by you. Please claim again.' });
    }

    const amount = Number(t.amount_cents || 0);
    const userId = t.user_id;

    // 2) Fetch wallets (user + treasury) and lock them
    const { rows: uw } = await client.query(
      `SELECT id AS wallet_id FROM wallets WHERE user_id = $1 LIMIT 1 FOR UPDATE`,
      [userId]
    );
    if (!uw.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'User wallet not found.' });
    }
    const userWalletId = uw[0].wallet_id;

    const { rows: tw } = await client.query(
      `SELECT id AS wallet_id, user_id AS treasury_user_id, is_treasury
       FROM wallets
       WHERE id = $1
       FOR UPDATE`,
      [treasury_wallet_id]
    );
    const twr = tw[0];
    if (!twr || !twr.is_treasury) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Selected wallet is not a treasury wallet.' });
    }
    const treasuryUserId = twr.treasury_user_id;

    // 3) Debit balances (guard against negatives)
    const { rowCount: userUpd } = await client.query(
      `UPDATE wallets SET balance = balance - $1 WHERE id = $2 AND balance >= $1`,
      [amount, userWalletId]
    );
    if (userUpd !== 1) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Insufficient user balance.' });
    }

    const { rowCount: treasUpd } = await client.query(
      `UPDATE wallets SET balance = balance - $1 WHERE id = $2 AND balance >= $1`,
      [amount, treasury_wallet_id]
    );
    if (treasUpd !== 1) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Treasury has insufficient funds.' });
    }

    // 4) Double-entry transactions (explicit types so PG never guesses)
    // 4a) User ledger — debit
    await client.query(
      `
      INSERT INTO transactions (
        id, user_id, wallet_id, amount_cents, currency, type, description, created_at, transfer_id
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, 'BMD'::text, 'debit'::text, 'Bank transfer out'::text, NOW(), $4::uuid
      )
      `,
      [userId, userWalletId, amount, id]
    );

    // 4b) Treasury ledger — debit (money leaves treasury to external bank)
    await client.query(
      `
      INSERT INTO transactions (
        id, user_id, wallet_id, amount_cents, currency, type, description, created_at, transfer_id
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, 'BMD'::text, 'debit'::text, 'Bank payout (ACH/Wire)'::text, NOW(), $4::uuid
      )
      `,
      [treasuryUserId, treasury_wallet_id, amount, id]
    );

    // If you also want a *credit* somewhere internal, add it here (and adjust balances accordingly).
    // Current model: funds leave both the cardholder wallet and the treasury (to the outside bank).

    // 5) Finalize transfer
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
    if (client.release) client.release();
  }
}

// COMPLETE — enable both PATCH and POST
router.patch('/:id/complete', requireAccountsRole, wrap(doComplete));
router.post('/:id/complete',  requireAccountsRole, wrap(doComplete)); // optional POST alias

// --- Cardholder view: latest request
// Returns requested_at (canonical) PLUS created_at mirror for compatibility.
router.get('/mine/latest', async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;

    const { rows } = await db.query(
      `
      SELECT
        id,
        requested_at,
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
    const r = rows[0];
    return res.json({ ...r, created_at: r.requested_at });
  } catch (e) {
    console.error('transfers/mine/latest error', e);
    res.status(500).json({ message: 'Failed to load latest transfer.' });
  }
});

// --- Cardholder: create a new transfer request
// Ensure your `transfers` table has a `memo` column if you want to persist memo.
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

    // Soft balance check (wallets.balance is cents)
    try {
      const w = await db.query(
        `SELECT balance FROM wallets WHERE user_id = $1 LIMIT 1`,
        [userId]
      );
      const walletCents = Number(w.rows?.[0]?.balance || 0);
      if (!Number.isNaN(walletCents) && amt > walletCents) {
        return res.status(400).json({ message: 'Amount exceeds available balance.' });
      }
    } catch { /* ignore soft check errors */ }

    // Insert transfer (includes memo)
    const ins = await db.query(
      `
      INSERT INTO transfers (
        user_id, amount_cents, bank, destination_masked, status, requested_at, memo
      ) VALUES (
        $1, $2, $3, $4, 'pending', NOW(), $5
      )
      RETURNING
        id, user_id, amount_cents, bank, destination_masked, status, requested_at
      `,
      [userId, amt, bank, destination_masked, memo]
    );

    // Mirror created_at for compatibility
    const row = ins.rows[0];
    return res.status(201).json({
      message: 'Transfer request submitted.',
      ...row,
      created_at: row.requested_at
    });
  } catch (e) {
    console.error('POST /api/transfers error:', e);
    return res.status(500).json({ message: 'Failed to submit transfer request.' });
  }
});

module.exports = router;
