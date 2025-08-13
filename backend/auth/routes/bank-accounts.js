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
       COALESCE(last4, RIGHT(account_number, 4)) AS last4
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

// POST /api/bank-accounts  → create a saved destination (no routing number required in BMU)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    let { holder_name, bank_name, account_number, routing_number } = req.body || {};

    // Trim & basic normalize
    holder_name = (holder_name || '').trim();
    bank_name   = (bank_name   || '').trim();
    // remove spaces/dashes from account number
    const acct  = String(account_number || '').replace(/[\s-]/g, '');

    // Required fields (NO routing number)
    if (!holder_name || !bank_name || !acct) {
      return res.status(400).json({ message: 'Missing required fields.' });
    }

    // Basic account number sanity (tweak as needed)
    if (!/^\d{6,20}$/.test(acct)) {
      return res.status(400).json({ message: 'Invalid account number.' });
    }

    // If your schema still has routing_number, we insert NULL when not provided.
    // (See migration note below to drop NOT NULL.)
    const params = [userId, holder_name, bank_name, acct, routing_number || null];

    const { rows } = await db.query(
      `
      INSERT INTO bank_accounts
        (user_id, holder_name, bank_name, account_number, routing_number, last4)
      VALUES
        ($1,      $2,          $3,        $4,             $5,            RIGHT($4,4))
      RETURNING id, bank_name, RIGHT($4,4) AS last4
      `,
      params
    );

    return res.status(201).json(rows[0]);
  } catch (e) {
    console.error('bank-accounts POST error', e);
    return res.status(500).json({ message: 'Failed to save bank account.' });
  }
});

module.exports = router;
