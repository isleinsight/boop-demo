// backend/auth/routes/transfers.js
const express = require('express');
const router = express.Router();
const db = require('../../db');
const { authenticateToken } = require('../middleware/authMiddleware');

// --- settings --------------------------------------------------------------
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

async function parentLinkedToStudent(parentId, studentUserId) {
  const q = `SELECT 1 FROM student_parents WHERE student_id = $1 AND parent_id = $2 LIMIT 1`;
  const { rows } = await db.query(q, [studentUserId, parentId]);
  return rows.length > 0;
}

async function ensureBankCounterparty(client, bank, destination_masked) {
  const safeBank = String(bank || 'Bank').trim();
  const mask = String(destination_masked || '').trim();
  const m = mask.match(/(\d{4})\s*$/);
  const last4 = m ? m[1] : '0000';

  const slug  = `${safeBank}-${last4}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const email = `counterparty+${slug}@boop.local`;
  const first_name = safeBank;
  const last_name  = `•••• ${last4}`;

  const upsertSql = `
    INSERT INTO users (email, first_name, last_name, role, type, status, created_at, updated_at)
    VALUES ($1, $2, $3, 'vendor', 'vendor', 'active', NOW(), NOW())
    ON CONFLICT (email)
    DO UPDATE SET first_name = EXCLUDED.first_name,
                  last_name  = EXCLUDED.last_name,
                  updated_at = NOW()
    RETURNING id
  `;
  const { rows } = await client.query(upsertSql, [email, first_name, last_name]);
  return rows[0].id;
}

async function resolveTreasuryWallet(client, idOrUserId) {
  const q = `
    SELECT id AS wallet_id, user_id AS treasury_user_id, is_treasury, name
      FROM wallets
     WHERE (id::text = $1 OR user_id::text = $1)
     LIMIT 1
  `;
  const { rows } = await client.query(q, [String(idOrUserId)]);
  return rows[0] || null;
}

const toInt = (v, d) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
};

function requireAccountsRole(req, res, next) {
  const role = String(req.user?.role || '').toLowerCase();
  const type = String(req.user?.type || '').toLowerCase();
  if (role !== 'admin' || !['accountant', 'treasury', 'viewer'].includes(type)) {
    return res.status(403).json({ message: 'Not authorized for transfers.' });
  }
  next();
}

function requireVendor(req, res, next) {
  const role = (req.user?.role || '').toLowerCase();
  if (role !== 'vendor') return res.status(403).json({ message: 'Vendor role required.' });
  next();
}

// --- health ----------------------------------------------------------------
router.get('/ping', (_req, res) => res.json({ ok: true, message: 'Transfers route is alive' }));

// --- auth gate for everything below ---------------------------------------
router.use(authenticateToken);

/* ======================  ADMIN/ACCOUNTS QUEUE  ======================= */

router.get('/', requireAccountsRole, async (req, res) => {
  try {
    await releaseExpiredClaims();

    const { status = 'pending', start, end, bank, limit = 25, offset = 0 } = req.query;
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
      LIMIT $${values.length - 1} OFFSET $${values.length}
    `;
    const { rows: itemsRaw } = await db.query(listSql, values);
    const items = itemsRaw.map(r => ({ ...r, created_at: r.requested_at }));
    res.json({ items, total });
  } catch (err) {
    console.error('❌ transfers list error:', err);
    res.status(500).json({ message: 'Failed to load transfers.' });
  }
});

// claim / release / reject / complete — (unchanged from your version)
// … keep your doClaim, doRelease, doReject, doComplete handlers here …
/* (omitted here for brevity — use exactly what you already have) */

/* ======================  CARDHOLDER SUBMIT  ======================= */

router.get('/mine/latest', async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { rows } = await db.query(
      `SELECT id, requested_at, status, amount_cents
         FROM transfers
        WHERE user_id = $1
        ORDER BY requested_at DESC
        LIMIT 1`,
      [userId]
    );
    if (!rows.length) return res.json({});
    const r = rows[0];
    res.json({ ...r, created_at: r.requested_at });
  } catch (e) {
    console.error('transfers/mine/latest error', e);
    res.status(500).json({ message: 'Failed to load latest transfer.' });
  }
});

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

    // verify bank account
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

    try {
      const w = await db.query(`SELECT balance FROM wallets WHERE user_id = $1 LIMIT 1`, [userId]);
      const walletCents = Number(w.rows?.[0]?.balance || 0);
      if (!Number.isNaN(walletCents) && amt > walletCents) {
        return res.status(400).json({ message: 'Amount exceeds available balance.' });
      }
    } catch {}

    const ins = await db.query(
      `INSERT INTO transfers (user_id, amount_cents, bank, destination_masked, status, requested_at, memo)
       VALUES ($1, $2, $3, $4, 'pending', NOW(), $5)
       RETURNING id, user_id, amount_cents, bank, destination_masked, status, requested_at`,
      [userId, amt, bank, destination_masked, memo]
    );
    const row = ins.rows[0];
    res.status(201).json({ message: 'Transfer request submitted.', ...row, created_at: row.requested_at });
  } catch (e) {
    console.error('POST /api/transfers error:', e);
    res.status(500).json({ message: 'Failed to submit transfer request.' });
  }
});

router.post('/parent', async (req, res) => {
  try {
    const me = req.user || {};
    const role = (me.role || '').toLowerCase();
    const type = (me.type || '').toLowerCase();
    const parentId = me.userId || me.id;

    const isAdmin  = role === 'admin';
    const isParent = role === 'parent' || type === 'parent';
    if (!isParent && !isAdmin) return res.status(403).json({ message: 'Only parents may submit this transfer.' });

    const { student_id, bank_account_id, amount_cents, memo = '' } = req.body || {};
    const amt = Number(amount_cents);
    if (!student_id || !bank_account_id || !Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ message: 'Invalid student, bank account, or amount.' });
    }

    if (!isAdmin) {
      const linked = await parentLinkedToStudent(parentId, student_id);
      if (!linked) return res.status(403).json({ message: 'Not authorized for this student.' });
    }

    const ba = await db.query(
      `SELECT bank_name AS bank, RIGHT(account_number, 4) AS last4
         FROM bank_accounts
        WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
        LIMIT 1`,
      [bank_account_id, parentId]
    );
    if (!ba.rowCount) return res.status(404).json({ message: 'Bank account not found.' });

    const bank = ba.rows[0].bank;
    const last4 = String(ba.rows[0].last4 || '').slice(-4);
    const destination_masked = `${bank} •••• ${last4}`;

    try {
      const w = await db.query(`SELECT balance FROM wallets WHERE user_id = $1 LIMIT 1`, [student_id]);
      const walletCents = Number(w.rows?.[0]?.balance || 0);
      if (!Number.isNaN(walletCents) && amt > walletCents) {
        return res.status(400).json({ message: "Amount exceeds student's available balance." });
      }
    } catch {}

    const ins = await db.query(
      `INSERT INTO transfers (user_id, amount_cents, bank, destination_masked, status, requested_at, memo)
       VALUES ($1, $2, $3, $4, 'pending', NOW(), $5)
       RETURNING id, user_id, amount_cents, bank, destination_masked, status, requested_at`,
      [student_id, amt, bank, destination_masked, memo]
    );
    const row = ins.rows[0];
    return res.status(201).json({ message: 'Transfer request submitted.', ...row, created_at: row.requested_at });
  } catch (e) {
    console.error('POST /api/transfers/parent error:', e);
    return res.status(500).json({ message: 'Failed to submit transfer request.' });
  }
});

router.get('/student/:id/latest', async (req, res) => {
  try {
    const me = req.user || {};
    const role = String(me.role || '').toLowerCase();
    const requesterId = me.userId || me.id;
    const studentId = String(req.params.id || '').trim();

    if (!studentId) return res.status(400).json({ message: 'Missing student id.' });

    let authorized = false;
    if (role === 'admin') authorized = true;
    else if (role === 'parent') authorized = await parentLinkedToStudent(requesterId, studentId);
    else if (role === 'cardholder' || role === 'cardholder_assistance') authorized = String(requesterId) === String(studentId);
    if (!authorized) return res.status(403).json({ message: 'Not authorized for this student.' });

    const { rows } = await db.query(
      `SELECT id, requested_at, status, amount_cents
         FROM transfers
        WHERE user_id = $1
        ORDER BY requested_at DESC
        LIMIT 1`,
      [studentId]
    );
    if (!rows.length) return res.json({});
    const r = rows[0];
    return res.json({ ...r, created_at: r.requested_at });
  } catch (e) {
    console.error('GET /api/transfers/student/:id/latest error', e);
    return res.status(500).json({ message: 'Failed to load latest transfer.' });
  }
});

/* ======================  VENDOR READS (for vendor UI)  ======================= */

// NOTE: your transfers table uses requested_at, not created_at.
// Also, older rows may not have bank_account_id, so we rely on bank + destination_masked.
router.get('/mine', requireVendor, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    const limit = Math.min(Math.max(toInt(req.query.limit, 25), 1), 200);
    const offset = Math.max(toInt(req.query.offset, 0), 0);

    const q = `
      SELECT
        t.id,
        t.user_id,
        t.amount_cents,
        COALESCE(t.status, 'submitted') AS status,
        t.requested_at AS created_at,
        t.bank AS bank_name,
        RIGHT(t.destination_masked, 4) AS last4
      FROM transfers t
      WHERE t.user_id = $1
      ORDER BY t.requested_at DESC
      LIMIT $2 OFFSET $3
    `;
    const { rows } = await db.query(q, [userId, limit, offset]);
    return res.json({ transfers: rows, totalCount: rows.length });
  } catch (err) {
    console.error('❌ GET /transfers/mine error:', err);
    return res.status(500).json({ message: 'Failed to load transfers.' });
  }
});

router.get('/mine/latest', requireVendor, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    const q = `
      SELECT
        t.id,
        t.user_id,
        t.amount_cents,
        COALESCE(t.status, 'submitted') AS status,
        t.requested_at AS created_at,
        t.bank AS bank_name,
        RIGHT(t.destination_masked, 4) AS last4
      FROM transfers t
      WHERE t.user_id = $1
      ORDER BY t.requested_at DESC
      LIMIT 1
    `;
    const { rows } = await db.query(q, [userId]);
    return res.json(rows[0] || {});
  } catch (err) {
    console.error('❌ GET /transfers/mine/latest error:', err);
    return res.status(500).json({ message: 'Failed to load latest transfer.' });
  }
});

module.exports = router;
