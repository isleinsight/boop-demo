const path = require('path');
const dotenvPath = path.resolve(__dirname, '../.env');
console.log('Attempting to load .env from:', dotenvPath);
require('dotenv').config({ path: dotenvPath });
console.log('Environment variables loaded:', {
  TREASURY_WALLET_ID_HSBC: process.env.TREASURY_WALLET_ID_HSBC,
  TREASURY_WALLET_ID_BUTTERFIELD: process.env.TREASURY_WALLET_ID_BUTTERFIELD
});

const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { authenticateToken } = require('../middleware/authMiddleware');
const logAdminAction = require('../middleware/log-admin-action');

// GET /api/treasury/wallet-id — for a TREASURY admin: return *their* treasury wallet
router.get('/wallet-id', authenticateToken, async (req, res) => {
  const { role, type, id: userId } = req.user;
  if (role !== 'admin' || type !== 'treasury') {
    return res.status(403).json({ message: 'Forbidden' });
  }

  try {
    const q = `
      SELECT id, COALESCE(name,'Treasury Wallet') AS name
      FROM wallets
      WHERE user_id = $1 AND (is_treasury = true OR name ILIKE 'treasury%')
      ORDER BY created_at ASC
      LIMIT 1
    `;
    const { rows } = await pool.query(q, [userId]);
    if (!rows.length) return res.status(404).json({ message: 'No treasury wallet for this user.' });
    res.json({ wallet_id: rows[0].id, name: rows[0].name });
  } catch (err) {
    console.error('❌ Error fetching wallet ID:', err);
    res.status(500).json({ message: 'Failed to retrieve wallet ID' });
  }
});


// GET treasury balance for current user
router.get('/balance', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  try {
    const result = await pool.query(
      'SELECT balance FROM wallets WHERE user_id = $1',
      [userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Wallet not found for this user.' });
    }
    const { balance } = result.rows[0];
    res.json({ balance_cents: Math.round(parseFloat(balance) * 100) });
  } catch (err) {
    console.error('❌ Error fetching balance:', err.message);
    res.status(500).json({ message: 'Failed to retrieve balance' });
  }
});

// POST adjust treasury balance (credit or debit)
router.post('/adjust', authenticateToken, async (req, res) => {
  const { amount_cents, note, type } = req.body;
  const userId = req.user.id;
  if (!amount_cents || typeof amount_cents !== 'number' || !note || !['credit', 'debit'].includes(type)) {
    return res.status(400).json({ message: 'Missing or invalid adjustment data.' });
  }
  const amount = amount_cents / 100;
  try {
    const walletRes = await pool.query(
      'SELECT id, balance FROM wallets WHERE user_id = $1',
      [userId]
    );
    if (walletRes.rows.length === 0) {
      return res.status(404).json({ message: 'Wallet not found for this user.' });
    }
    const { id: walletId, balance: currentBalance } = walletRes.rows[0];
    let newBalance = type === 'credit' ? parseFloat(currentBalance) + amount : parseFloat(currentBalance) - amount;
    if (newBalance < 0) {
      return res.status(400).json({ message: 'Insufficient funds.' });
    }
    await pool.query('UPDATE wallets SET balance = $1 WHERE id = $2', [newBalance, walletId]);
    await pool.query(
      `INSERT INTO transactions (wallet_id, user_id, amount_cents, type, note) VALUES ($1, $2, $3, $4, $5)`,
      [walletId, userId, amount_cents, type, note]
    );
    await logAdminAction({
      performed_by: req.user.id,
      target_user_id: userId,
      action: `wallet_${type}`,
      type: req.user.type,
      status: 'completed',
      completed_at: new Date()
    });
    res.status(200).json({ message: 'Balance updated successfully.' });
  } catch (err) {
    console.error('❌ Error submitting adjustment:', err.message);
    await logAdminAction({
      performed_by: req.user.id,
      target_user_id: userId,
      action: `wallet_${type}`,
      type: req.user.type,
      status: 'failed',
      error_message: err.message
    });
    res.status(500).json({ message: 'Adjustment failed.' });
  }
});

// GET recent treasury transactions (latest 5)
router.get('/recent', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  try {
    const txRes = await pool.query(
      `SELECT amount_cents, type, note, created_at FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5`,
      [userId]
    );
    res.json(txRes.rows);
  } catch (err) {
    console.error('❌ Error fetching recent transactions:', err.message);
    res.status(500).json({ message: 'Could not fetch recent transactions.' });
  }
});



module.exports = router;
