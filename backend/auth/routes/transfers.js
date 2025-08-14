// backend/auth/routes/transfers.js
const express = require('express');
const router = express.Router();
const db = require('../../db');
const { authenticateToken } = require('../middleware/authMiddleware');

// --- Claim TTL (minutes)
const CLAIM_TTL_MINUTES = 30;

// --- helpers ---------------------------------------------------------------
async function getDbClient() {
  if (db?.pool?.connect) return db.pool.connect();
  if (typeof db.getClient === 'function') return db.getClient();
  if (typeof db.connect === 'function') return db.connect();
  throw new Error('DB client access not available; expose pool.connect() / getClient() on your db helper.');
}

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

// return Set of column names for a table
async function tableCols(client, table) {
  const { rows } = await client.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1`,
    [table]
  );
  return new Set(rows.map(r => r.column_name));
}

// build a safe INSERT for transactions, adapting to optional columns
function buildTxnInsert(cols, {
  userId, walletId, amountCents, type, description,
  transferId, counterpartyUserId = null, counterpartyLabel = null
}) {
  const hasAmountCents = cols.has('amount_cents');
  const amountCol = hasAmountCents ? 'amount_cents' : (cols.has('amount') ? 'amount' : 'amount_cents');

  const insertCols = ['id', 'user_id', 'created_at', 'currency', 'type', 'description', 'transfer_id'];
  const values = ['gen_random_uuid()', '$1', 'NOW()', `'BMD'::text`, '$2', '$3', '$4'];
  const params = [userId, type, description, transferId];

  if (cols.has('wallet_id')) { insertCols.push('wallet_id'); values.push('$' + (params.push(walletId), params.length)); }
  insertCols.push(amountCol); values.push('$' + (params.push(amountCents), params.length));

  if (cols.has('from_user_id')) { insertCols.push('from_user_id'); values.push('$' + (params.push(userId), params.length)); }
  if (cols.has('to_user_id'))   { insertCols.push('to_user_id');   values.push(counterpartyUserId ? '$' + (params.push(counterpartyUserId), params.length) : 'NULL'); }
  if (cols.has('counterparty')) { insertCols.push('counterparty'); values.push('$' + (params.push(counterpartyLabel), params.length)); }
  if (cols.has('counterparty_user_id')) {
    insertCols.push('counterparty_user_id');
    values.push(counterpartyUserId ? '$' + (params.push(counterpartyUserId), params.length) : 'NULL');
  }
  if (cols.has('note')) { insertCols.push('note'); values.push('$' + (params.push(description), params.length)); }

  const sql = `INSERT INTO transactions (${insertCols.join(',')}) VALUES (${values.join(',')})`;
  return { sql, params };
}

// --- Health ---------------------------------------------------------------
router.get('/ping', (req, res) => {
  res.json({ ok: true, message: 'Transfers route is alive' });
});

// --- Auth gate for everything below --------------------------------------
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
 * NOTE: returns `requested_at` (canonical) and also `created_at` mirror for older UI.
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

    if (status) { values.push(status.toLowerCase()); where.push(`t.status = $${values.length}`); }
    if (start)  { values.push(start);                where.push(`t.requested_at >= $${values.length}`); }
    if (end)    { values.push(end);                  where.push(`t.requested_at <= $${values.length}`); }
    if (bank)   { values.push(bank);                 where.push(`t.bank = $${values.length}`); }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countSql = `SELECT COUNT(*)::int AS total FROM transfers t ${whereSql};`;
    const { rows: countRows } = await db.query(countSql, values);
    const total = countRows[0]?.total || 0;

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
    const items = itemsRaw.map(r => ({ ...r, created_at: r.requested_at })); // compatibility

    res.json({ items, total });
  } catch (err) {
    console.error('❌ transfers list error:', err);
    res.status(500).json({ message: 'Failed to load transfers.' });
  }
});

// small wrapper so POST & PATCH share handlers
const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

// --- CLAIM -----------------------------------------------------------------
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
router.post('/:id/claim',  requireAccountsRole, wrap(doClaim));

// --- RELEASE ---------------------------------------------------------------
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
router.post('/:id/release',  requireAccountsRole, wrap(doRelease));

// --- REJECT ----------------------------------------------------------------
async function doReject(req, res) {
  const id = req.params.id;
  const reason = (req.body?.reason || '').slice(0, 255); // (optional)
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
  // TODO: persist reason somewhere if you want
  res.json({ ok: true, transfer: rows[0] });
}
router.patch('/:id/reject', requireAccountsRole, wrap(doReject));
router.post('/:id/reject',  requireAccountsRole, wrap(doReject));

// --- COMPLETE (double-entry + debits) -------------------------------------
async function doComplete(req, res) {
  const id = req.params.id;
  const me = req.user.userId || req.user.id;
  const { bank_reference, internal_note, treasury_wallet_id } = req.body || {};

  if (!bank_reference || String(bank_reference).trim().length < 4) {
    return res.status(400).json({ message: 'bank_reference is required.' });
  }
  if (!treasury_wallet_id) {
    return res.status(400).json({ message: 'treasury_wallet_id is required.' });
  }

  await releaseExpiredClaims();

  const client = await getDbClient();
  try {
    await client.query('BEGIN');

    // Lock transfer and validate claim + freshness
    const { rows: trows } = await client.query(
      `SELECT id, user_id, amount_cents, status, claimed_by, claimed_at, bank, destination_masked
         FROM transfers
        WHERE id = $1
        FOR UPDATE`,
      [id]
    );
    const t = trows[0];
    if (!t) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Transfer not found.' }); }
    const isClaimedByMe = t.status === 'claimed' && String(t.claimed_by) === String(me);
    const fresh = t.claimed_at && (new Date(t.claimed_at) > new Date(Date.now() - CLAIM_TTL_MINUTES * 60 * 1000));
    if (!isClaimedByMe || !fresh) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Claim expired or not owned by you. Please claim again.' });
    }

    const userId = t.user_id;
    const amount = Number(t.amount_cents || 0);

    // Lock user wallet
    const { rows: uw } = await client.query(
      `SELECT id, balance FROM wallets WHERE user_id = $1 LIMIT 1 FOR UPDATE`,
      [userId]
    );
    if (!uw.length) { await client.query('ROLLBACK'); return res.status(409).json({ message: 'User wallet not found.' }); }
    const userWalletId = uw[0].id;

    // Lock treasury wallet, ensure is_treasury = true
    const { rows: tw } = await client.query(
      `SELECT id, balance FROM wallets WHERE id = $1 AND is_treasury = true FOR UPDATE`,
      [treasury_wallet_id]
    );
    if (!tw.length) { await client.query('ROLLBACK'); return res.status(409).json({ message: 'Treasury wallet not found.' }); }

    // 1) Debit user wallet
    const { rowCount: userUpd } = await client.query(
      `UPDATE wallets SET balance = balance - $1 WHERE id = $2 AND balance >= $1`,
      [amount, userWalletId]
    );
    if (userUpd !== 1) { await client.query('ROLLBACK'); return res.status(409).json({ message: 'Insufficient user balance.' }); }

    // 2) Debit treasury wallet
    const { rowCount: treUpd } = await client.query(
      `UPDATE wallets SET balance = balance - $1 WHERE id = $2 AND is_treasury = true AND balance >= $1`,
      [amount, treasury_wallet_id]
    );
    if (treUpd !== 1) { await client.query('ROLLBACK'); return res.status(409).json({ message: 'Treasury has insufficient funds.' }); }

    // 3) Ledger rows
    const txnCols = await tableCols(client, 'transactions');
    const treasuryOwnerId = null; // if your treasury wallets are not tied to a user; adjust if you have a specific admin user

    const destMask = t.destination_masked || t.bank || 'External bank';
    const userDesc = `Bank transfer to ${destMask}`;
    const treDesc  = `Bank payout for transfer ${t.id}`;

    // user row (debit)
    {
      const { sql, params } = buildTxnInsert(txnCols, {
        userId,
        walletId: userWalletId,
        amountCents: amount,
        type: 'debit',
        description: userDesc,
        transferId: t.id,
        counterpartyUserId: null,
        counterpartyLabel: destMask
      });
      await client.query(sql, params);
    }
    // treasury row (debit out to bank; set counterparty to user so UI can show a name)
    {
      const { sql, params } = buildTxnInsert(txnCols, {
        userId: treasuryOwnerId,                // stays null if your schema allows; otherwise set to an admin user id
        walletId: treasury_wallet_id,
        amountCents: amount,
        type: 'debit',
        description: treDesc,
        transferId: t.id,
        counterpartyUserId: userId,
        counterpartyLabel: `Cardholder ${userId}`
      });
      await client.query(sql, params);
    }

    // 4) Mark transfer completed
    await client.query(
      `UPDATE transfers
          SET status = 'completed',
              bank_reference = $2,
              completed_at = NOW()
        WHERE id = $1`,
      [t.id, String(bank_reference).trim()]
    );

    await client.query('COMMIT');
    res.json({ ok: true, transfer: { id: t.id, status: 'completed', bank_reference, completed_at: new Date().toISOString() } });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('doComplete error:', e);
    res.status(500).json({ message: 'Failed to complete transfer.' });
  } finally {
    if (client?.release) client.release();
  }
}
router.patch('/:id/complete', requireAccountsRole, wrap(doComplete));
router.post('/:id/complete',  requireAccountsRole, wrap(doComplete)); // POST alias

// --- Cardholder view: latest request --------------------------------------
router.get('/mine/latest', async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { rows } = await db.query(
      `
      SELECT id, requested_at, status, amount_cents
        FROM transfers
       WHERE user_id = $1
       ORDER BY requested_at DESC
       LIMIT 1
      `,
      [userId]
    );
    if (!rows.length) return res.json({});
    const r = rows[0];
    res.json({ ...r, created_at: r.requested_at }); // compatibility mirror
  } catch (e) {
    console.error('transfers/mine/latest error', e);
    res.status(500).json({ message: 'Failed to load latest transfer.' });
  }
});

// --- Cardholder: create a new transfer request -----------------------------
router.post('/', async (req, res) => {
  try {
    const me = req.user || {};
    const role = (me.role || '').toLowerCase();
    const type = (me.type || '').toLowerCase();
    const userId = me.userId || me.id;

    const isCardholder =
      role === 'cardholder' || type === 'cardholder' ||
      role === 'cardholder_assistance' || type === 'cardholder_assistance';
    if (!isCardholder) return res.status(403).json({ message: 'Not authorized to submit transfers.' });

    const { bank_account_id, amount_cents, memo = '' } = req.body || {};
    const amt = Number(amount_cents);
    if (!bank_account_id || !Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ message: 'Invalid bank account or amount.' });
    }

    // Verify bank account belongs to this user
    const ba = await db.query(
      `SELECT bank_name AS bank, RIGHT(account_number, 4) AS last4
         FROM bank_accounts
        WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
        LIMIT 1`,
      [bank_account_id, userId]
    );
    if (!ba.rowCount) return res.status(404).json({ message: 'Bank account not found.' });
    const bank = ba.rows[0].bank;
    const last4 = String(ba.rows[0].last4 || '').slice(-4);
    const destination_masked = `${bank} •••• ${last4}`;

    // Soft balance check (wallets.balance is cents)
    try {
      const w = await db.query(`SELECT balance FROM wallets WHERE user_id = $1 LIMIT 1`, [userId]);
      const walletCents = Number(w.rows?.[0]?.balance || 0);
      if (!Number.isNaN(walletCents) && amt > walletCents) {
        return res.status(400).json({ message: 'Amount exceeds available balance.' });
      }
    } catch { /* ignore soft check errors */ }

    const ins = await db.query(
      `
      INSERT INTO transfers (
        user_id, amount_cents, bank, destination_masked, status, requested_at, memo
      ) VALUES ($1, $2, $3, $4, 'pending', NOW(), $5)
      RETURNING id, user_id, amount_cents, bank, destination_masked, status, requested_at
      `,
      [userId, amt, bank, destination_masked, memo]
    );
    const row = ins.rows[0];
    res.status(201).json({ message: 'Transfer request submitted.', ...row, created_at: row.requested_at });
  } catch (e) {
    console.error('POST /api/transfers error:', e);
    res.status(500).json({ message: 'Failed to submit transfer request.' });
  }
});

module.exports = router;
