// backend/auth/routes/treasury.js
const express = require('express');
const router = express.Router();
const db = require('../../db');
const { authenticateToken } = require('../middleware/authMiddleware');

console.log('🧭 treasury.js loaded');

// ---------- helpers ----------
function requireTreasury(req, res, next) {
  const role = String(req.user?.role || '').toLowerCase();
  const type = String(req.user?.type || '').toLowerCase();
  if (role !== 'admin' || type !== 'treasury') {
    return res.status(403).json({ message: 'Forbidden' });
  }
  next();
}

function requireTreasuryOrAccountant(req, res, next) {
  const role = String(req.user?.role || '').toLowerCase();
  const type = String(req.user?.type || '').toLowerCase();
  if (role !== 'admin' || !['treasury', 'accountant'].includes(type)) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  next();
}

async function getDbClient() {
  if (db?.pool?.connect) return db.pool.connect();
  if (typeof db.getClient === 'function') return db.getClient();
  if (typeof db.connect === 'function') return db.connect();
  throw new Error('DB client access not available; expose pool.connect()/getClient() on your db helper.');
}

// ---------- health ----------
router.get('/ping', (_req, res) => res.json({ ok: true }));

// ---------- wallet id for current treasury admin ----------
router.get('/wallet-id', authenticateToken, requireTreasury, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const q = `
      SELECT id, COALESCE(name,'Treasury Wallet') AS name
      FROM wallets
      WHERE user_id = $1
        AND (is_treasury = true OR name ILIKE 'treasury%')
      ORDER BY created_at ASC
      LIMIT 1
    `;
    const { rows } = await db.query(q, [userId]);
    if (!rows.length) return res.status(404).json({ message: 'No treasury wallet for this user.' });
    res.json({ wallet_id: rows[0].id, name: rows[0].name });
  } catch (err) {
    console.error('❌ /wallet-id error:', err);
    res.status(500).json({ message: 'Failed to retrieve wallet ID' });
  }
});

// ---------- list all treasury/merchant wallets (for selectors) ----------
router.get('/treasury-wallets', authenticateToken, requireTreasury, async (_req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT id,
             COALESCE(name,'Treasury Wallet') AS name,
             balance AS balance_cents
      FROM wallets
      WHERE is_treasury = true
         OR name ILIKE 'treasury%%'
         OR name ILIKE 'merchant%%'
      ORDER BY name
    `);
    if (!rows.length) return res.status(404).json({ message: 'No treasury wallets found in database.' });
    res.json(rows);
  } catch (err) {
    console.error('❌ /treasury-wallets error:', err);
    res.status(500).json({ message: 'Failed to fetch treasury wallets' });
  }
});

// For the Transfers screen: allow accountants OR treasury admins.
// Returns the same list as /treasury-wallets.
router.get('/merchant-wallets', authenticateToken, requireTreasuryOrAccountant, async (_req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT id,
             COALESCE(name,'Treasury Wallet') AS name,
             balance AS balance_cents
      FROM wallets
      WHERE is_treasury = true
         OR name ILIKE 'treasury%%'
         OR name ILIKE 'merchant%%'
      ORDER BY name
    `);
    res.json(rows);
  } catch (err) {
    console.error('❌ /merchant-wallets error:', err);
    res.status(500).json({ message: 'Failed to load merchant wallets' });
  }
});

// ---------- balance (preferred wallet-scoped, plus a query fallback) ----------
router.get('/wallet/:id/balance', authenticateToken, requireTreasury, async (req, res) => {
  try {
    const { rows } = await db.query(`SELECT balance AS balance_cents FROM wallets WHERE id = $1 LIMIT 1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Wallet not found.' });
    res.json({ balance_cents: Number(rows[0].balance_cents || 0) });
  } catch (err) {
    console.error('❌ /wallet/:id/balance error:', err);
    res.status(500).json({ message: 'Failed to retrieve balance' });
  }
});

router.get('/balance', authenticateToken, requireTreasury, async (req, res) => {
  try {
    const id = req.query.wallet_id;
    if (!id) return res.status(400).json({ message: 'wallet_id is required' });
    const { rows } = await db.query(`SELECT balance AS balance_cents FROM wallets WHERE id = $1 LIMIT 1`, [id]);
    if (!rows.length) return res.status(404).json({ message: 'Wallet not found.' });
    res.json({ balance_cents: Number(rows[0].balance_cents || 0) });
  } catch (err) {
    console.error('❌ /balance error:', err);
    res.status(500).json({ message: 'Failed to retrieve balance' });
  }
});

// ---------- recent transactions (wallet-scoped + fallback) ----------
router.get('/wallet/:id/recent', authenticateToken, requireTreasury, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT amount_cents, type, note, description, created_at
         FROM transactions
        WHERE wallet_id = $1
        ORDER BY created_at DESC
        LIMIT 5`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('❌ /wallet/:id/recent error:', err);
    res.status(500).json({ message: 'Could not fetch recent transactions.' });
  }
});

router.get('/recent', authenticateToken, requireTreasury, async (req, res) => {
  try {
    const id = req.query.wallet_id;
    if (!id) return res.status(400).json({ message: 'wallet_id is required' });
    const { rows } = await db.query(
      `SELECT amount_cents, type, note, description, created_at
         FROM transactions
        WHERE wallet_id = $1
        ORDER BY created_at DESC
        LIMIT 5`,
      [id]
    );
    res.json(rows);
  } catch (err) {
    console.error('❌ /recent error:', err);
    res.status(500).json({ message: 'Could not fetch recent transactions.' });
  }
});

// ---------- adjust handlers (wallet-scoped + generic) ----------
async function doAdjust(req, res) {
  const body = req.body || {};
  const walletId = req.params.id || body.wallet_id;
  const amt = Math.round(Number(body.amount_cents || 0));
  const t = String(body.type || '').toLowerCase(); // 'credit'|'debit'
  const note = (body.note || '').slice(0, 255);

  if (!walletId || !Number.isFinite(amt) || amt <= 0 || !['credit', 'debit'].includes(t)) {
    return res.status(400).json({ message: 'Invalid wallet, amount, or type.' });
  }

  const client = await getDbClient();
  try {
    await client.query('BEGIN');

    const { rows: wrows } = await client.query(
      `SELECT id, user_id, balance FROM wallets WHERE id = $1 LIMIT 1`,
      [walletId]
    );
    if (!wrows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Wallet not found.' });
    }
    const wallet = wrows[0];

    if (t === 'debit' && Number(wallet.balance) < amt) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Insufficient wallet balance.' });
    }

    const delta = t === 'credit' ? amt : -amt;
    await client.query(`UPDATE wallets SET balance = balance + $1 WHERE id = $2`, [delta, walletId]);

    await client.query(
      `
      INSERT INTO transactions (
        user_id, wallet_id, amount_cents, currency, type, method,
        note, description, reference_code, metadata, created_at, updated_at
      ) VALUES (
        $1, $2, $3, 'BMD', $4, 'manual',
        $5, 'Manual treasury adjustment', NULL, $6, NOW(), NOW()
      )
      `,
      [
        wallet.user_id,
        walletId,
        Math.abs(amt),
        t,
        note,
        JSON.stringify({ via: 'treasury_adjust' })
      ]
    );

    await client.query('COMMIT');
    return res.json({ ok: true });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('❌ /adjust error:', err);
    return res.status(500).json({ message: 'Adjustment failed' });
  } finally {
    client.release && client.release();
  }
}

router.post('/wallet/:id/adjust', authenticateToken, requireTreasury, doAdjust);
router.post('/adjust',            authenticateToken, requireTreasury, doAdjust);

module.exports = router;
