// backend/auth/routes/treasury.js
const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { authenticateToken } = require('../middleware/authMiddleware');

// GET treasury balance for current user
router.get('/balance', authenticateToken, async (req, res) => {
  const userId = req.user.id;

  try {
    const result = await pool.query(
      'SELECT balance FROM wallets WHERE user_id = $1 AND status = $2',
      [userId, 'active']
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

  if (
    !amount_cents ||
    typeof amount_cents !== 'number' ||
    !note ||
    !['credit', 'debit'].includes(type)
  ) {
    return res.status(400).json({ message: 'Missing or invalid adjustment data.' });
  }

  const amount = amount_cents / 100;

  try {
    const walletRes = await pool.query(
      'SELECT id, balance FROM wallets WHERE user_id = $1 AND status = $2',
      [userId, 'active']
    );

    if (walletRes.rows.length === 0) {
      return res.status(404).json({ message: 'Wallet not found for this user.' });
    }

    const { id: walletId, balance: currentBalance } = walletRes.rows[0];

    let newBalance =
      type === 'credit'
        ? parseFloat(currentBalance) + amount
        : parseFloat(currentBalance) - amount;

    if (newBalance < 0) {
      return res.status(400).json({ message: 'Insufficient funds.' });
    }

    // Update balance
    await pool.query(
      'UPDATE wallets SET balance = $1 WHERE id = $2',
      [newBalance, walletId]
    );

    // Log transaction
    await pool.query(
      `INSERT INTO transactions (wallet_id, user_id, amount_cents, type, note)
       VALUES ($1, $2, $3, $4, $5)`,
      [walletId, userId, amount_cents, type, note]
    );

    res.status(200).json({ message: 'Balance updated successfully.' });
  } catch (err) {
    console.error('❌ Error submitting adjustment:', err.message);
    res.status(500).json({ message: 'Adjustment failed.' });
  }
});

// GET recent treasury transactions (latest 5)
router.get('/recent', authenticateToken, async (req, res) => {
  const userId = req.user.id;

  try {
    const txRes = await pool.query(
      `SELECT amount_cents, type, note, created_at
       FROM transactions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 5`,
      [userId]
    );

    res.json(txRes.rows);
  } catch (err) {
    console.error('❌ Error fetching recent transactions:', err.message);
    res.status(500).json({ message: 'Could not fetch recent transactions.' });
  }
});

module.exports = router;
