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

// Block system/staff/household roles as P2P recipients
function isP2PBlockedRole(role, type) {
  const r = String(role || "").toLowerCase();
  const t = String(type || "").toLowerCase();
  const v = r || t;
  const blocked = new Set(["admin", "accountant", "treasury", "staff", "support", "student", "parent"]);
  return blocked.has(v);
}

// Cardholder-like gate (senders)
function requireCardholderLike(req, res, next) {
  const r = String(req.user?.role || "").toLowerCase();
  const t = String(req.user?.type || "").toLowerCase();
  const ok =
    r === "cardholder" || t === "cardholder" ||
    r === "cardholder_assistance" || t === "cardholder_assistance" ||
    r === "senior" || t === "senior";
  if (!ok) return res.status(403).json({ message: "Cardholder access required." });
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

// claim / release / reject / complete — keep your existing handlers here
// (no changes required to those admin actions)

/* ======================  CARDHOLDER SUBMIT (to bank) ======================= */

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

    // optional: anti-overdraw
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

    // optional: anti-overdraw (student)
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

/* ======================  P2P (cardholder → cardholder)  ======================= */
/**
 * POST /api/transfers/p2p
 * Body: { to_user_id: uuid, amount?: number, amount_cents?: integer, note?: string }
 *
 * - Only cardholders/seniors (and assistance variant) may send
 * - Disallow sending to admins/staff/treasury/student/parent
 * - Requires both users have wallets
 * - Locks both wallets, ensures funds, updates balances
 * - Inserts double-entry transactions with method/category metadata
 */
router.post('/p2p', requireCardholderLike, async (req, res) => {
  const senderId = req.user?.userId || req.user?.id;
  const { to_user_id, amount, amount_cents, note } = req.body || {};

  try {
    if (!to_user_id) return res.status(400).json({ message: "Missing to_user_id" });

    const cents = Number.isFinite(Number(amount_cents))
      ? Number(amount_cents)
      : Math.round(Number(amount || 0) * 100);

    if (!Number.isFinite(cents) || cents <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    // Load sender + recipient with wallet + role/type
    const qUser = `
      SELECT id, wallet_id, role, type
      FROM users
      WHERE id = $1 AND deleted_at IS NULL AND (status IS NULL OR LOWER(status) = 'active')
      LIMIT 1
    `;
    const [sRes, rRes] = await Promise.all([
      db.query(qUser, [senderId]),
      db.query(qUser, [to_user_id]),
    ]);

    if (!sRes.rowCount) return res.status(404).json({ message: "Sender not found" });
    if (!rRes.rowCount) return res.status(404).json({ message: "Recipient not found" });

    const sender = sRes.rows[0];
    const recip  = rRes.rows[0];

    if (!sender.wallet_id) return res.status(400).json({ message: "Sender wallet missing" });
    if (!recip.wallet_id)  return res.status(400).json({ message: "Recipient wallet missing" });

    // Block disallowed recipient roles (admin/treasury/staff/student/parent, etc.)
    if (isP2PBlockedRole(recip.role, recip.type)) {
      return res.status(400).json({ message: "That user cannot receive peer-to-peer transfers." });
    }

    // Do not allow sending to self
    if (String(sender.id) === String(recip.id)) {
      return res.status(400).json({ message: "Cannot send to yourself." });
    }

    const client = await getDbClient();
    try {
      await client.query('BEGIN');

      // Lock both wallets (deterministic order prevents deadlocks)
      const lockIds = [sender.wallet_id, recip.wallet_id].sort();
      await client.query(`SELECT id FROM wallets WHERE id = ANY($1) FOR UPDATE`, [lockIds]);

      // Check balance
      const sBalRes = await client.query(`SELECT balance FROM wallets WHERE id = $1`, [sender.wallet_id]);
      const senderBal = Number(sBalRes.rows?.[0]?.balance || 0);
      if (senderBal < cents) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: "Insufficient funds" });
      }

      // Update balances
      await client.query(`UPDATE wallets SET balance = balance - $1 WHERE id = $2`, [cents, sender.wallet_id]);
      await client.query(`UPDATE wallets SET balance = balance + $1 WHERE id = $2`, [cents, recip.wallet_id]);

      // Insert transactions (double-entry)
      const metadata = { method: 'p2p' };

      // sender (debit)
      await client.query(`
        INSERT INTO transactions
          (wallet_id, user_id, type, amount_cents, note, method, category,
           sender_id, recipient_id, metadata, created_at)
        VALUES
          ($1, $2, 'debit', $3, $4, 'p2p', 'transfer',
           $2, $5, $6::jsonb, NOW())
      `, [sender.wallet_id, sender.id, cents, note || null, recip.id, JSON.stringify(metadata)]);

      // recipient (credit)
      await client.query(`
        INSERT INTO transactions
          (wallet_id, user_id, type, amount_cents, note, method, category,
           sender_id, recipient_id, metadata, created_at)
        VALUES
          ($1, $2, 'credit', $3, $4, 'p2p', 'transfer',
           $5, $2, $6::jsonb, NOW())
      `, [recip.wallet_id, recip.id, cents, note || null, sender.id, JSON.stringify(metadata)]);

      await client.query('COMMIT');

      return res.status(201).json({
        ok: true,
        message: "Transfer completed",
        amount_cents: cents,
        to_user_id: recip.id
      });
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch {}
      console.error('❌ P2P transfer error:', e);
      return res.status(500).json({ message: "Transfer failed" });
    } finally {
      if (client?.release) client.release();
    }
  } catch (e) {
    console.error('🔥 /api/transfers/p2p unhandled:', e);
    return res.status(500).json({ message: "Server error" });
  }
});

/* ======================  VENDOR READS (for vendor UI)  ======================= */

// NOTE: transfers table uses requested_at, not created_at.
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
