// ./auth/routes/bank-accounts.js
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');
const db = require('../../db');

/** Restrict to Admin + (accountant|treasury) just like transfers admin */
function requireAccountsRole(req, res, next) {
  const { role, type } = req.user || {};
  if (role !== 'admin' || !['accountant', 'treasury'].includes((type || '').toLowerCase())) {
    return res.status(403).json({ message: 'Not authorized.' });
  }
  next();
}

/** GET /api/bank-accounts/mine — list masked accounts for logged-in user */
router.get('/mine', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { rows } = await db.query(
      `
      SELECT id,
             bank_name,
             COALESCE(last4, RIGHT(account_number, 4)) AS last4
      FROM bank_accounts
      WHERE user_id = $1
        AND deleted_at IS NULL
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

/**
 * NEW: GET /api/bank-accounts/by-transfer/:transferId
 * Admin (accountant/treasury) only. Returns exactly { account_number }.
 * Matches the user's bank account using transfers.bank and the last4 from transfers.destination_masked.
 */
router.get('/by-transfer/:transferId', authenticateToken, requireAccountsRole, async (req, res) => {
  try {
    const transferId = req.params.transferId;

    // Load the transfer
    const tRes = await db.query(
      `
      SELECT user_id, bank, destination_masked
      FROM transfers
      WHERE id = $1
      LIMIT 1
      `,
      [transferId]
    );
    if (!tRes.rowCount) {
      return res.status(404).json({ message: 'Transfer not found.' });
    }

    const { user_id, bank, destination_masked } = tRes.rows[0];
    const last4 = (destination_masked || '').match(/(\d{4})\s*$/)?.[1] || null;
    if (!last4) {
      return res.status(404).json({ message: 'Could not determine last4 from destination.' });
    }

    // Find the matching bank account for that user (by bank name + last4)
    const bRes = await db.query(
      `
      SELECT account_number
      FROM bank_accounts
      WHERE user_id = $1
        AND deleted_at IS NULL
        AND bank_name = $2
        AND RIGHT(account_number, 4) = $3
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [user_id, bank, last4]
    );

    if (!bRes.rowCount) {
      return res.status(404).json({ message: 'Matching bank account not found.' });
    }

    // Return only what you need
    return res.json({ account_number: bRes.rows[0].account_number });
  } catch (e) {
    console.error('bank-accounts/by-transfer error', e);
    return res.status(500).json({ message: 'Failed to load account number.' });
  }
});

/**
 * OPTIONAL: GET /api/bank-accounts/:id/number — direct by bank_account id
 * Admin (accountant/treasury) only. Returns exactly { account_number }.
 */
router.get('/:id/number', authenticateToken, requireAccountsRole, async (req, res) => {
  try {
    const id = req.params.id;
    const r = await db.query(
      `SELECT account_number
       FROM bank_accounts
       WHERE id = $1 AND deleted_at IS NULL
       LIMIT 1`,
      [id]
    );
    if (!r.rowCount) return res.status(404).json({ message: 'Bank account not found.' });
    return res.json({ account_number: r.rows[0].account_number });
  } catch (e) {
    console.error('bank-accounts/:id/number error', e);
    return res.status(500).json({ message: 'Failed to load account number.' });
  }
});

/** POST /api/bank-accounts — save a new destination */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    let { holder_name, bank_name, account_number, routing_number } = req.body || {};

    holder_name = (holder_name || '').trim();
    bank_name   = (bank_name   || '').trim();
    const acct  = String(account_number || '').replace(/[\s-]/g, '');

    if (!holder_name || !bank_name || !acct) {
      return res.status(400).json({ message: 'Missing required fields.' });
    }
    if (!/^\d{6,20}$/.test(acct)) {
      return res.status(400).json({ message: 'Invalid account number.' });
    }

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
