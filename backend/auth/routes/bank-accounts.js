// ./auth/routes/bank-accounts.js
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');
// const db = require('../../db');

router.get('/mine', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    // TODO: replace with real query
    // const rows = await db.any('SELECT id, bank_name, last4 FROM bank_accounts WHERE user_id=$1 AND deleted_at IS NULL ORDER BY created_at DESC', [userId]);
    const rows = []; // placeholder
    res.json(rows);
  } catch (e) {
    console.error('bank-accounts/mine error', e);
    res.status(500).json({ message: 'Failed to load bank accounts.' });
  }
});

router.post('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { holder_name, bank_name, account_number, routing_number } = req.body || {};

    if (!holder_name || !bank_name || !account_number || !routing_number) {
      return res.status(400).json({ message: 'Missing required fields.' });
    }

    const last4 = String(account_number).slice(-4);
    // TODO: store securely (hash/encrypt account_number & routing_number)
    // const row = await db.one(
    //   `INSERT INTO bank_accounts (user_id, holder_name, bank_name, account_number_enc, routing_enc, last4)
    //    VALUES ($1,$2,$3,encrypt($4),encrypt($5),$6) RETURNING id, bank_name, last4`,
    //   [userId, holder_name, bank_name, account_number, routing_number, last4]
    // );

    const row = { id: 'temp_' + Date.now(), bank_name, last4 }; // placeholder
    res.status(201).json(row);
  } catch (e) {
    console.error('bank-accounts POST error', e);
    res.status(500).json({ message: 'Failed to save bank account.' });
  }
});

module.exports = router;
