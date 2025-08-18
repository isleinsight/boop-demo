// backend/auth/routes/treasury.js
const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { authenticateToken } = require('../middleware/authMiddleware');

console.log('🧭 treasury.js loaded');

// --- utils ---------------------------------------------------------------
function requireTreasury(req, res) {
  const { role, type } = req.user || {};
  if (role !== 'admin' || type !== 'treasury') {
    res.status(403).json({ message: 'Forbidden' });
    return false;
  }
  return true;
}

async function getWalletById(id) {
  const { rows } = await pool.query(
    `SELECT id, user_id, balance, is_treasury, COALESCE(name,'Treasury Wallet') AS name
       FROM wallets
      WHERE id = $1
      LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

// --- health --------------------------------------------------------------
router.get('/ping', (_req, res) => res.json({ ok: true }));

// --- wallet for current treasury admin ----------------------------------
router.get('/wallet-id', authenticateToken, async (req, res) => {
  if (!requireTreasury(req, res)) return;
  const userId = req.user.id;

  try {
    const q = `
      SELECT id, COALESCE(name,'Treasury Wallet') AS name
        FROM wallets
       WHERE user_id = $1
         AND (is_treasury = true OR name ILIKE 'treasury%')
       ORDER BY created_at ASC
       LIMIT 1
    `;
    const { rows } = await pool.query(q, [userId]);
    if (!rows.length) return res.status(404).json({ message: 'No treasury wallet for this user.' });
    res.json({ wallet_id: rows[0].id, name: rows[0].name });
  } catch (err) {
    console.error('❌ /wallet-id error:', err);
    res.status(500).json({ message: 'Failed to retrieve wallet ID' });
  }
});

// --- list all treasury wallets (admin+treasury only) ---------------------
router.get('/treasury-wallets', authenticateToken, async (req, res) => {
  if (!requireTreasury(req, res)) return;

  try {
    const { rows } = await pool.query(`
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

// --- balance (wallet-scoped + fallback) ----------------------------------
router.get('/wallet/:id/balance', authenticateToken, async (req, res) => {
  if (!requireTreasury(req, res)) return;
  const walletId = req.params.id;

  try {
    const w = await getWalletById(walletId);
    if (!w) return res.status(404).json({ message: 'Wallet not found.' });
    if (!w.is_treasury) return res.status(403).json({ message: 'Not a treasury wallet.' });

    res.json({ balance_cents: Number(w.balance || 0) });
  } catch (err) {
    console.error('❌ /wallet/:id/balance error:', err);
    res.status(500).json({ message: 'Failed to retrieve balance' });
  }
});

router.get('/balance', authenticateToken, async (req, res) => {
  if (!requireTreasury(req, res)) return;

  try {
    const walletId = req.query.wallet_id;
    if (walletId) {
      const w = await getWalletById(walletId);
      if (!w) return res.status(404).json({ message: 'Wallet not found.' });
      if (!w.is_treasury) return res.status(403).json({ message: 'Not a treasury wallet.' });
      return res.json({ balance_cents: Number(w.balance || 0) });
    }

    // fallback: current user’s first treasury wallet
    const { rows } = await pool.query(
      `SELECT balance
         FROM wallets
        WHERE user_id = $1 AND (is_treasury = true OR name ILIKE 'treasury%')
        ORDER BY created_at ASC
        LIMIT 1`,
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Wallet not found for this user.' });
    res.json({ balance_cents: Number(rows[0].balance || 0) });
  } catch (err) {
    console.error('❌ /balance error:', err);
    res.status(500).json({ message: 'Failed to retrieve balance' });
  }
});

// --- recent transactions (wallet-scoped + fallback) ----------------------
router.get('/wallet/:id/recent', authenticateToken, async (req, res) => {
  if (!requireTreasury(req, res)) return;
  const walletId = req.params.id;

  try {
    const w = await getWalletById(walletId);
    if (!w) return res.status(404).json({ message: 'Wallet not found.' });
    if (!w.is_treasury) return res.status(403).json({ message: 'Not a treasury wallet.' });

    const { rows } = await pool.query(
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

router.get('/recent', authenticateToken, async (req, res) => {
  if (!requireTreasury(req, res)) return;

  try {
    const walletId = req.query.wallet_id;
    if (walletId) {
      const { rows } = await pool.query(
        `SELECT amount_cents, type, note, description, created_at
           FROM transactions
          WHERE wallet_id = $1
          ORDER BY created_at DESC
          LIMIT 5`,
        [walletId]
      );
      return res.json(rows);
    }

    const { rows } = await pool.query(
      `SELECT amount_cents, type, note, description, created_at
         FROM transactions
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 5`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('❌ /recent error:', err);
    res.status(500).json({ message: 'Could not fetch recent transactions.' });
  }
});

// --- adjust balance (wallet-scoped + fallback) ---------------------------
router.post('/wallet/:id/adjust', authenticateToken, async (req, res) => {
  if (!requireTreasury(req, res)) return;
  const walletId = req.params.id;
  const { amount_cents, type, note } = req.body || {};

  const amt = Math.abs(Number(amount_cents || 0));
  const t = String(type || '').toLowerCase();

  if (!amt || !['credit', 'debit'].includes(t)) {
    return res.status(400).json({ message: 'Invalid amount or type.' });
  }

  const client = await (pool.pool?.connect ? pool.pool.connect() : pool.connect());
  try {
    await client.query('BEGIN');

    const w = await client.query(
      `SELECT id, user_id, balance, is_treasury
         FROM wallets
        WHERE id = $1
        LIMIT 1`,
      [walletId]
    );
    if (!w.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Wallet not found.' });
    }
    const wallet = w.rows[0];
    if (!wallet.is_treasury) {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: 'Not a treasury wallet.' });
    }

    if (t === 'debit' && Number(wallet.balance || 0) < amt) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Insufficient balance.' });
    }

    const delta = t === 'credit' ? amt : -amt;

    await client.query(
      `UPDATE wallets SET balance = balance + $1 WHERE id = $2`,
      [delta, walletId]
    );

    await client.query(
      `INSERT INTO transactions (
         user_id, wallet_id, amount_cents, currency, type, method,
         note, description, metadata, created_at, updated_at
       ) VALUES (
         $1, $2, $3, 'BMD', $4, 'manual',
         $5, 'Manual treasury adjustment', $6, NOW(), NOW()
       )`,
      [
        wallet.user_id,
        walletId,
        amt,
        t,
        note || '',
        JSON.stringify({ source: 'treasury_adjustment' })
      ]
    );

    await client.query('COMMIT');
    return res.json({ ok: true });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('❌ /wallet/:id/adjust error:', err);
    return res.status(500).json({ message: 'Adjustment failed' });
  } finally {
    client.release && client.release();
  }
});

// Fallback: POST /api/treasury/adjust with { wallet_id, amount_cents, type, note }
router.post('/adjust', authenticateToken, async (req, res) => {
  if (!requireTreasury(req, res)) return;
  const { wallet_id } = req.body || {};
  if (!wallet_id) return res.status(400).json({ message: 'wallet_id is required' });
  req.params.id = wallet_id;
  return router.handle(req, res); // reuse the route above
});

module.exports = router;
