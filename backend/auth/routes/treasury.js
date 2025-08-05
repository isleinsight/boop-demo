// backend/auth/routes/treasury.js
const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { authenticateToken } = require('../middleware/authMiddleware');
const logAdminAction = require('../middleware/log-admin-action');

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

    // ✅ Admin Action Logging
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

// GET /api/treasury-wallets — Fetch HSBC and Butterfield wallets from .env
router.get('/treasury-wallets', authenticateToken, async (req, res) => {
  const { role, type } = req.user;
  if (role !== 'admin' || type !== 'accountant') {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  try {
    const treasuryWallets = [
      { id: process.env.HSBC_WALLET_ID, name: 'HSBC Treasury' },
      { id: process.env.BUTTERFIELD_WALLET_ID, name: 'Butterfield Treasury' }
    ].filter(w => w.id); // Filter out undefined IDs
    if (treasuryWallets.length === 0) {
      throw new Error('No treasury wallets configured');
    }
    res.status(200).json(treasuryWallets);
  } catch (err) {
    console.error('❌ Error fetching treasury wallets:', err.message);
    res.status(500).json({ error: 'Failed to fetch treasury wallets' });
  }
});

module.exports = router;
