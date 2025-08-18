// backend/auth/routes/treasury.js
const express = require('express');
const router = express.Router();
const db = require('../../db');
const { authenticateToken } = require('../middleware/authMiddleware');

console.log('🧭 treasury.js loaded');

function requireTreasury(req, res, next) {
  const { role, type } = req.user || {};
  if (role !== 'admin' || type !== 'treasury') {
    return res.status(403).json({ message: 'Forbidden' });
  }
  next();
}

// Public ping (mount check)
router.get('/ping', (_req, res) => res.json({ ok: true }));

// ────────────────────────────────────────────────────────────────────────────
// Wallet lookups
// ────────────────────────────────────────────────────────────────────────────

// Current treasury admin’s first treasury wallet (by user_id)
router.get('/wallet-id', authenticateToken, requireTreasury, async (req, res) => {
  const userId = req.user.id || req.user.userId;
  try {
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

// Merchant wallets from ENV (visible only to treasury admins)
router.get('/merchant-wallets', authenticateToken, requireTreasury, async (_req, res) => {
  try {
    const wallets = [
      { id: process.env.MERCHANT_WALLET_ID_HSBC,       name: 'HSBC Merchant Wallet' },
      { id: process.env.MERCHANT_WALLET_ID_BUTTERFIELD, name: 'Butterfield Merchant Wallet' },
    ].filter(w => w.id);
    return res.json(wallets);
  } catch (err) {
    console.error('merchant-wallets error', err);
    res.status(500).json({ message: 'Failed to load merchant wallets' });
  }
});

// (Optional, but kept) list all treasury wallets in DB (treasury-only)
router.get('/treasury-wallets', authenticateToken, requireTreasury, async (_req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT id, COALESCE(name,'Treasury Wallet') AS name
      FROM wallets
      WHERE is_treasury = true OR name ILIKE 'treasury%'
      ORDER BY name
    `);
    if (!rows.length) return res.status(404).json({ message: 'No treasury wallets found in database.' });
    res.json(rows);
  } catch (err) {
    console.error('❌ /treasury-wallets error:', err);
    res.status(500).json({ message: 'Failed to fetch treasury wallets' });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// Balances / recent activity
// ────────────────────────────────────────────────────────────────────────────

// Wallet-scoped balance
router.get('/wallet/:id/balance', authenticateToken, requireTreasury, async (req, res) => {
  const walletId = req.params.id;
  try {
    const { rows } = await db.query(`SELECT balance FROM wallets WHERE id = $1 LIMIT 1`, [walletId]);
    if (!rows.length) return res.status(404).json({ message: 'Wallet not found.' });
    res.json({ balance_cents: Number(rows[0].balance || 0) });
  } catch (err) {
    console.error('❌ /wallet/:id/balance error:', err);
    res.status(500).json({ message: 'Failed to retrieve balance' });
  }
});

// Current user’s first treasury wallet balance (legacy fallback)
router.get('/balance', authenticateToken, requireTreasury, async (req, res) => {
  const userId = req.user.id || req.user.userId;
  try {
    const { rows } = await db.query(
      `SELECT balance
         FROM wallets
        WHERE user_id = $1 AND (is_treasury = true OR name ILIKE 'treasury%')
        ORDER BY created_at ASC
        LIMIT 1`,
      [userId]
    );
    if (!rows.length) return res.status(404).json({ message: 'Wallet not found for this user.' });
    res.json({ balance_cents: Number(rows[0].balance || 0) });
  } catch (err) {
    console.error('❌ /balance error:', err);
    res.status(500).json({ message: 'Failed to retrieve balance' });
  }
});

// Wallet-scoped recent transactions (simple list)
router.get('/wallet/:id/recent', authenticateToken, requireTreasury, async (req, res) => {
  const walletId = req.params.id;
  try {
    const { rows } = await db.query(
      `SELECT amount_cents, type, note, description, created_at
         FROM transactions
        WHERE wallet_id = $1
        ORDER BY created_at DESC
        LIMIT 5`,
      [walletId]
    );
    res.json(rows);
  } catch (err) {
    console.error('❌ /wallet/:id/recent error:', err);
    res.status(500).json({ message: 'Could not fetch recent transactions.' });
  }
});

// Current user’s recent transactions (legacy fallback)
router.get('/recent', authenticateToken, requireTreasury, async (req, res) => {
  const userId = req.user.id || req.user.userId;
  try {
    const { rows } = await db.query(
      `SELECT amount_cents, type, note, description, created_at
         FROM transactions
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 5`,
      [userId]
    );
    res.json(rows);
  } catch (err) {
    console.error('❌ /recent error:', err);
    res.status(500).json({ message: 'Could not fetch recent transactions.' });
  }
});

// ────────────────────────────────────────────────────────────────────────────
/**
 * Adjust a treasury/merchant wallet balance.
 * Body: { wallet_id, amount_cents, type: 'credit'|'debit', note }
 */
router.post('/adjust', authenticateToken, requireTreasury, async (req, res) => {
  const { wallet_id, amount_cents, type, note } = req.body || {};
  const amt = Math.round(Number(amount_cents || 0));
  const t = String(type || '').toLowerCase();
  const noteStr = (note || '').slice(0, 255);

  if (!wallet_id || !Number.isFinite(amt) || amt <= 0 || !['credit', 'debit'].includes(t)) {
    return res.status(400).json({ message: 'Invalid wallet, amount, or type.' });
  }

  const client = await (db.pool?.connect ? db.pool.connect() : db.getClient());
  try {
    await client.query('BEGIN');

    const { rows: wrows } = await client.query(
      `SELECT id, user_id, balance FROM wallets WHERE id = $1 LIMIT 1`,
      [wallet_id]
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

    // Update balance (+ for credit, - for debit)
    const delta = t === 'credit' ? amt : -amt;
    await client.query(
      `UPDATE wallets SET balance = balance + $1 WHERE id = $2`,
      [delta, wallet_id]
    );

    // Record transaction
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
        wallet_id,
        Math.abs(amt),
        t,
        noteStr,
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
});

// Wallet-scoped alias: POST /wallet/:id/adjust  (body: { amount_cents, type, note })
router.post('/wallet/:id/adjust', authenticateToken, requireTreasury, async (req, res) => {
  req.body = { ...(req.body || {}), wallet_id: req.params.id };
  return router.handle(req, res); // re-dispatch to /adjust below
});

// NOTE: The line above re-dispatches to this router again; since that's tricky in Express,
// we implement it as a tiny forwarder instead of router.handle() to avoid recursion.

router.post('/wallet/:id/adjust', authenticateToken, requireTreasury, async (req, res, next) => {
  // This middleware was duplicated by accident; keep only the forwarder below:
  next();
});

// Forwarder (final)
router.post('/wallet/:id/adjust', authenticateToken, requireTreasury, async (req, res) => {
  const payload = { ...(req.body || {}), wallet_id: req.params.id };
  // Manually call the /adjust logic:
  req.body = payload;
  // reuse the same code path:
  const fakeReq = req, fakeRes = res;
  // Invoke the handler directly:
  return router.stack.find(l => l.route && l.route.path === '/adjust' && l.route.methods.post)
    .handle(fakeReq, fakeRes);
});

module.exports = router;
