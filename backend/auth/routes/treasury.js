// backend/auth/routes/treasury.js
const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { authenticateToken } = require('../middleware/authMiddleware');

console.log('🧭 treasury.js loaded');

// Public ping so we can verify the router is mounted (no auth)
router.get('/ping', (req, res) => res.json({ ok: true }));

// ---- Auth gate for everything below --------------------------------------
router.use(authenticateToken);

// Helpers
function requireTreasury(req, res, next) {
  const { role, type } = req.user || {};
  if (role !== 'admin' || type !== 'treasury') {
    return res.status(403).json({ message: 'Forbidden' });
  }
  next();
}
async function getTreasuryWalletById(id) {
  const q = `
    SELECT id, user_id, COALESCE(name,'Treasury Wallet') AS name, is_treasury, balance
      FROM wallets
     WHERE id = $1
     LIMIT 1
  `;
  const { rows } = await pool.query(q, [id]);
  return rows[0] || null;
}

// GET /api/treasury/wallet-id
// For a TREASURY admin: return *their* treasury wallet from the DB
router.get('/wallet-id', requireTreasury, async (req, res) => {
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

// GET /api/treasury/treasury-wallets
// Visible to ACCOUNTANTs (unchanged from your version)
router.get('/treasury-wallets', async (req, res) => {
  const { role, type } = req.user || {};
  if (role !== 'admin' || type !== 'accountant') {
    return res.status(403).json({ message: 'Forbidden' });
  }
  try {
    const { rows } = await pool.query(`
      SELECT id, COALESCE(name,'Treasury Wallet') AS name
      FROM wallets
      WHERE is_treasury = true OR name ILIKE 'treasury%'
      ORDER BY name
    `);
    if (!rows.length) {
      return res.status(404).json({ message: 'No treasury wallets found in database.' });
    }
    res.json(rows);
  } catch (err) {
    console.error('❌ /treasury-wallets error:', err);
    res.status(500).json({ message: 'Failed to fetch treasury wallets' });
  }
});

// Current user’s treasury balance (kept as-is)
router.get('/balance', requireTreasury, async (req, res) => {
  const userId = req.user.id;
  try {
    const { rows } = await pool.query(
      `SELECT balance
         FROM wallets
        WHERE user_id = $1 AND (is_treasury = true OR name ILIKE 'treasury%')
        ORDER BY created_at ASC
        LIMIT 1`,
      [userId]
    );
    if (!rows.length) return res.status(404).json({ message: 'Wallet not found for this user.' });
    const balance = Number(rows[0].balance || 0);
    res.json({ balance_cents: Math.round(balance * 100) });
  } catch (err) {
    console.error('❌ /balance error:', err);
    res.status(500).json({ message: 'Failed to retrieve balance' });
  }
});

// Current user’s recent treasury txns (kept as-is)
router.get('/recent', requireTreasury, async (req, res) => {
  const userId = req.user.id;
  try {
    const { rows } = await pool.query(
      `SELECT amount_cents, type, note, created_at
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

// ---------------------------------------------------------------------------
// Wallet-scoped endpoints used by manage-treasury.js
// ---------------------------------------------------------------------------

// GET /api/treasury/wallet/:id/balance
router.get('/wallet/:id/balance', requireTreasury, async (req, res) => {
  try {
    const w = await getTreasuryWalletById(req.params.id);
    if (!w) return res.status(404).json({ message: 'Wallet not found.' });
    if (!w.is_treasury) return res.status(403).json({ message: 'Not a treasury wallet.' });
    res.json({ balance_cents: Math.round(Number(w.balance || 0) * 100) });
  } catch (err) {
    console.error('❌ /wallet/:id/balance error:', err);
    res.status(500).json({ message: 'Failed to retrieve balance' });
  }
});

// GET /api/treasury/wallet/:id/recent
router.get('/wallet/:id/recent', requireTreasury, async (req, res) => {
  try {
    const w = await getTreasuryWalletById(req.params.id);
    if (!w) return res.status(404).json({ message: 'Wallet not found.' });
    if (!w.is_treasury) return res.status(403).json({ message: 'Not a treasury wallet.' });

    const { rows } = await pool.query(
      `SELECT amount_cents, type, note, description, created_at
         FROM transactions
        WHERE wallet_id = $1
        ORDER BY created_at DESC
        LIMIT 5`,
      [w.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('❌ /wallet/:id/recent error:', err);
    res.status(500).json({ message: 'Failed to fetch recent transactions' });
  }
});

// POST /api/treasury/wallet/:id/adjust
router.post('/wallet/:id/adjust', requireTreasury, async (req, res) => {
  const walletId = req.params.id;
  const { amount_cents, type, note } = req.body || {};
  const amt = Number(amount_cents);

  if (!Number.isFinite(amt) || amt <= 0) {
    return res.status(400).json({ message: 'Invalid amount.' });
  }
  const t = String(type || '').toLowerCase();
  if (!['credit', 'debit'].includes(t)) {
    return res.status(400).json({ message: 'type must be "credit" or "debit".' });
  }
  const msg = String(note || '').trim();
  if (!msg) return res.status(400).json({ message: 'Note is required.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const w = await getTreasuryWalletById(walletId);
    if (!w) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Wallet not found.' });
    }
    if (!w.is_treasury) {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: 'Not a treasury wallet.' });
    }

    // wallets.balance is dollars (your schema). Convert cents -> dollars.
    const delta = (t === 'credit' ? +1 : -1) * (amt / 100);

    // Update balance with guard for negative on debit
    const { rowCount } = await client.query(
      `UPDATE wallets
          SET balance = balance + $1
        WHERE id = $2
          AND ($1 >= 0 OR balance + $1 >= 0)`,
      [delta, w.id]
    );
    if (rowCount !== 1) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Insufficient treasury balance.' });
    }

    // Record transaction
    await client.query(
      `INSERT INTO transactions (
          user_id, wallet_id, amount_cents, currency, type, method,
          note, description, reference_code, metadata, created_at, updated_at
       ) VALUES (
          $1,      $2,        $3,           'BMD',   $4,   'manual',
          $5,   NULL,         NULL,          $6,      NOW(), NOW()
       )`,
      [
        w.user_id,
        w.id,
        amt,
        t,               // 'credit' or 'debit'
        msg,
        JSON.stringify({ via: 'treasury_adjust' }),
      ]
    );

    await client.query('COMMIT');
    return res.json({ ok: true });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('❌ /wallet/:id/adjust error:', err);
    return res.status(500).json({ message: 'Failed to adjust treasury balance' });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// Fallback generic: POST /api/treasury/adjust  (accepts { wallet_id, ... })
// Used by your page if the wallet-scoped route 404s
// ---------------------------------------------------------------------------
router.post('/adjust', requireTreasury, async (req, res) => {
  const { wallet_id, amount_cents, type, note } = req.body || {};
  if (!wallet_id) return res.status(400).json({ message: 'wallet_id is required.' });
  // Reuse the wallet-scoped logic
  req.params.id = String(wallet_id);
  req.body = { amount_cents, type, note };
  return router.handle(req, res, () => {}); // delegate to /wallet/:id/adjust handler above
});

// ---------------------------------------------------------------------------
// (Optional) Merchant wallets from env (kept from your file)
// ---------------------------------------------------------------------------
router.get('/merchant-wallets', async (req, res) => {
  try {
    const wallets = [
      { id: process.env.MERCHANT_WALLET_ID_HSBC,       name: 'HSBC Merchant Wallet' },
      { id: process.env.MERCHANT_WALLET_ID_BUTTERFIELD, name: 'Butterfield Merchant Wallet' },
    ].filter(w => w.id);
    res.json(wallets);
  } catch (err) {
    console.error('merchant-wallets error', err);
    res.status(500).json({ message: 'Failed to load merchant wallets' });
  }
});

module.exports = router;
