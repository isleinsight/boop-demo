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

    res.json({ balance: parseFloat(balance) });
  } catch (err) {
    console.error('❌ Error fetching balance:', err.message);
    res.status(500).json({ message: 'Failed to retrieve balance' });
  }
});

// POST adjust treasury balance (credit or debit)
router.post('/adjust', authenticateToken, async (req, res) => {
  const { amount_cents, note, type } = req.body;
  const userId = req.user.id;

  if (!amount_cents || !note || !['credit', 'debit'].includes(type)) {
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

    let newBalance = type === 'credit'
      ? parseFloat(currentBalance) + amount
      : parseFloat(currentBalance) - amount;

    if (newBalance < 0) {
      return res.status(400).json({ message: 'Insufficient funds.' });
    }

    await pool.query(
      'UPDATE wallets SET balance = $1 WHERE id = $2',
      [newBalance, walletId]
    );

    // Optional: insert into transaction log
    await pool.query(
      `INSERT INTO transactions (user_id, wallet_id, type, amount, note, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [userId, walletId, type, amount, note]
    );

    res.json({ message: 'Balance updated successfully.' });
  } catch (err) {
    console.error('❌ Error submitting adjustment:', err.message);
    res.status(500).json({ message: 'Adjustment failed.' });
  }
});

module.exports = router;
