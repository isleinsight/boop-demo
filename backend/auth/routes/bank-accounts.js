// ./auth/routes/bank-accounts.js
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');
const db = require('../../db');

// GET /api/bank-accounts/mine  → list saved bank destinations for the logged-in user
router.get('/mine', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;

    const { rows } = await db.query(
      `
      SELECT id, bank_name, 
             RIGHT(account_number, 4) AS last4
      FROM bank_accounts
      WHERE user_id = $1
        AND (deleted_at IS NULL)
      ORDER BY created_at DESC
      `,
      [userId]
    );

    res.json(rows);
  } catch (e) {
    console.error('bank-accounts/mine error', e);
    res.status(500).json({ message: 'Failed to load bank accounts.' });
  }
});

// POST /api/bank-accounts  → create a saved destination
router.post('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { holder_name, bank_name, account_number, routing_number } = req.body || {};

    if (!holder_name || !bank_name || !account_number || !routing_number) {
      return res.status(400).json({ message: 'Missing required fields.' });
    }

    // NOTE: for production, store sensitive fields encrypted.
    const { rows } = await db.query(
      `
      INSERT INTO bank_accounts
        (user_id, holder_name, bank_name, account_number, routing_number, last4)
      VALUES
        ($1,      $2,          $3,        $4,             $5,            RIGHT($4,4))
      RETURNING id, bank_name, last4
      `,
      [userId, holder_name, bank_name, account_number, routing_number]
    );

    res.status(201).json(rows[0]);
  } catch (e) {
    console.error('bank-accounts POST error', e);
    res.status(500).json({ message: 'Failed to save bank account.' });
  }
});

module.exports = router;
