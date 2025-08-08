// backend/auth/routes/treasury.js
const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { authenticateToken } = require('../middleware/authMiddleware');

console.log('🧭 treasury.js loaded');

// Public ping so we can verify the router is mounted (no auth)
router.get('/ping', (req, res) => res.json({ ok: true }));

// GET /api/treasury/wallet-id
// For a TREASURY admin: return *their* treasury wallet from the DB
router.get('/wallet-id', authenticateToken, async (req, res) => {
  const { role, type, id: userId } = req.user;
  if (role !== 'admin' || type !== 'treasury') {
    return res.status(403).json({ message: 'Forbidden' });
  }

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
// For ACCOUNTANTS: list all treasury wallets that actually exist in the DB
router.get('/treasury-wallets', authenticateToken, async (req, res) => {
  const { role, type } = req.user;
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

// Optional helper: current treasury admin’s balance
router.get('/balance', authenticateToken, async (req, res) => {
  const { id: userId, role, type } = req.user;
  if (role !== 'admin' || type !== 'treasury') {
    return res.status(403).json({ message: 'Forbidden' });
  }
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

// Optional helper: last 5 transactions for current user
router.get('/recent', authenticateToken, async (req, res) => {
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

module.exports = router;
