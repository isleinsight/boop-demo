console.log('🧭 treasury.js loaded');

// backend/auth/routes/treasury.js
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { authenticateToken } = require('../middleware/authMiddleware');

console.log('🧭 treasury.js loaded');

// ───────────────────────────────────────────────────────────────────────────────
// Health check (public) – lets us confirm this router is mounted
router.get('/ping', (req, res) => res.json({ ok: true }));

// ───────────────────────────────────────────────────────────────────────────────
// GET /api/treasury/wallet-id
// For a TREASURY admin: return *their* treasury wallet from DB
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

// ───────────────────────────────────────────────────────────────────────────────
// GET /api/treasury/treasury-wallets
// For ACCOUNTANTS: list all treasury wallets that exist in DB
router.get('/treasury-wallets', authenticateToken, async (req, res) => {
  const { role, type } = req.user;
  if (role !== 'admin' || type !== 'accountant') {
    return res.status(403).json({ message: 'Forbidden' });
  }

  try {
    // Prefer explicit flag, fallback to name heuristic
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

// ───────────────────────────────────────────────────────────────────────────────
// GET /api/treasury/balance
// Current user's (treasury admin) wallet balance – simple helper
router.get('/balance', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  try {
    const result = await pool.query(
      'SELECT balance FROM wallets WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1',
      [userId]
    );
    if (!result.rows.length) {
      return res.status(404).json({ message: 'Wallet not found for this user.' });
    }
    const { balance } = result.rows[0];
    res.json({ balance_cents: Math.round(Number(balance) * 100) });
  } catch (err) {
    console.error('❌ /balance error:', err);
    res.status(500).json({ message: 'Failed to retrieve balance' });
  }
});

// ───────────────────────────────────────────────────────────────────────────────
// POST /api/treasury/adjust
// Adjust current user's treasury wallet (credit/debit the treasury itself)
// Body: { amount_cents: number, note: string, type: 'credit'|'debit' }
router.post('/adjust', authenticateToken, async (req, res) => {
  const { amount_cents, note, type } = req.body;
  const userId = req.user.id;

  if (!Number.isFinite(amount_cents) || amount_cents <= 0 || !note || !['credit', 'debit'].includes(type)) {
    return res.status(400).json({ message: 'Missing or invalid adjustment data.' });
  }

  const client = await pool.connect();
  try {
    // Get this user's first wallet (or you could target by is_treasury)
    const walletRes = await client.query(
      `SELECT id, balance FROM wallets
       WHERE user_id = $1
       ORDER BY created_at ASC
       LIMIT 1`,
      [userId]
    );
    if (!walletRes.rows.length) {
      return res.status(404).json({ message: 'Wallet not found for this user.' });
    }
    const { id: walletId, balance: currentBalance } = walletRes.rows[0];
    const delta = amount_cents / 100.0;
    const newBalance = type === 'credit'
      ? parseFloat(currentBalance) + delta
      : parseFloat(currentBalance) - delta;

    if (newBalance < 0) {
      return res.status(400).json({ message: 'Insufficient funds.' });
    }

    await client.query('BEGIN');

    await client.query('UPDATE wallets SET balance = $1 WHERE id = $2', [newBalance, walletId]);

    // Insert a simple transaction row (sender/recipient can be null here)
    await client.query(
      `INSERT INTO transactions
        (wallet_id, user_id, amount_cents, type, note, created_at, added_by)
       VALUES ($1, $2, $3, $4, $5, NOW(), $2)`,
      [walletId, userId, amount_cents, type, note]
    );

    await client.query('COMMIT');
    res.status(200).json({ message: 'Balance updated successfully.' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ /adjust error:', err);
    res.status(500).json({ message: 'Adjustment failed.' });
  } finally {
    client.release();
  }
});

// ───────────────────────────────────────────────────────────────────────────────
// GET /api/treasury/recent
// Latest 5 transactions for the current user (treasury admin)
router.get('/recent', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  try {
    const txRes = await pool.query(
      `SELECT amount_cents, type, note, created_at
       FROM transactions
       WHERE user_id = $1
       ORDER
