// backend/auth/routes/transfers.js
const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { authenticateToken } = require('../middleware/authMiddleware');

// Public ping for debugging
router.get('/ping', (req, res) => {
  res.json({ ok: true, message: 'Transfers route is alive' });
});

// Protected routes below here
router.use(authenticateToken);

// Example existing route
router.get('/', async (req, res) => {
  try {
    // ...existing transfer list logic...
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load transfers.' });
  }
});


// --- helpers ---------------------------------------------------------------
function requireAdmin(req, res) {
  const { role, type } = req.user || {};
  const ok = role === 'admin' && ['accountant', 'treasury', 'viewer'].includes((type || '').toLowerCase());
  if (!ok) {
    res.status(403).json({ message: 'Admins only.' });
    return false;
  }
  return true;
}

function requireCardholder(req, res) {
  const { role, type } = req.user || {};
  const r = (role || '').toLowerCase();
  const t = (type || '').toLowerCase();
  const ok = r === 'cardholder' || t === 'cardholder' || r === 'cardholder_assistance' || t === 'cardholder_assistance';
  if (!ok) {
    res.status(403).json({ message: 'Cardholder only.' });
    return false;
  }
  return true;
}

// --- create (cardholder) ---------------------------------------------------
router.post('/', authenticateToken, async (req, res) => {
  if (!requireCardholder(req, res)) return;

  try {
    const {
      amount_cents,
      destination = {},
      note
    } = req.body || {};

    if (!Number.isInteger(amount_cents) || amount_cents <= 0) {
      return res.status(400).json({ message: 'amount_cents must be a positive integer (cents).' });
    }

    const {
      bank_name = '',
      account_number_masked = '',
      routing = '',
      account_holder = ''
    } = destination;

    const { id: requester_user_id } = req.user;

    const { rows } = await pool.query(
      `INSERT INTO transfers
         (requester_user_id, amount_cents,
          destination_bank_name, destination_account_masked, destination_routing, destination_account_holder,
          note, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pending')
       RETURNING id`,
      [requester_user_id, amount_cents, bank_name, account_number_masked, routing, account_holder, note || null]
    );

    return res.status(201).json({ transfer_id: rows[0].id });
  } catch (err) {
    console.error('❌ create transfer error:', err);
    return res.status(500).json({ message: 'Failed to create transfer.' });
  }
});

// --- list (admin or cardholder self) ---------------------------------------
router.get('/', authenticateToken, async (req, res) => {
  const { status, mine, limit = 25, offset = 0 } = req.query;
  const isAdmin = req.user?.role === 'admin';

  const vals = [];
  const where = [];

  try {
    if (isAdmin) {
      if (status) { vals.push(status); where.push(`t.status = $${vals.length}`); }
      if (mine === 'in_progress') {
        vals.push(req.user.id);
        where.push(`t.status = 'in_progress' AND t.claimed_by = $${vals.length}`);
      }
    } else {
      // cardholder: only my own
      if (!requireCardholder(req, res)) return;
      vals.push(req.user.id);
      where.push(`t.requester_user_id = $${vals.length}`);
      if (status) { vals.push(status); where.push(`t.status = $${vals.length}`); }
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    vals.push(Math.min(parseInt(limit, 10) || 25, 200));
    vals.push(parseInt(offset, 10) || 0);

    const { rows } = await pool.query(
      `SELECT
         t.*,
         u.email AS requester_email,
         CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,'')) AS requester_name,
         a.email AS claimed_by_email
       FROM transfers t
       LEFT JOIN users u ON u.id = t.requester_user_id
       LEFT JOIN users a ON a.id = t.claimed_by
       ${whereSql}
       ORDER BY t.created_at DESC
       LIMIT $${vals.length-1} OFFSET $${vals.length}`,
      vals
    );

    return res.json(rows);
  } catch (err) {
    console.error('❌ list transfers error:', err);
    return res.status(500).json({ message: 'Failed to load transfers.' });
  }
});

// --- get one (admin or cardholder owner) -----------------------------------
router.get('/:id', authenticateToken, async (req, res) => {
  const id = req.params.id;
  try {
    const { rows } = await pool.query(
      `SELECT
         t.*,
         u.email AS requester_email,
         CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,'')) AS requester_name,
         a.email AS claimed_by_email
       FROM transfers t
       LEFT JOIN users u ON u.id = t.requester_user_id
       LEFT JOIN users a ON a.id = t.claimed_by
       WHERE t.id = $1`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Not found' });
    const row = rows[0];

    if (req.user.role === 'admin') return res.json(row);
    // cardholder may only view own
    if (row.requester_user_id !== req.user.id) return res.status(403).json({ message: 'Forbidden' });

    return res.json(row);
  } catch (err) {
    console.error('❌ get transfer error:', err);
    return res.status(500).json({ message: 'Failed to load transfer.' });
  }
});

// --- claim (admin) ---------------------------------------------------------
router.post('/:id/claim', authenticateToken, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const id = req.params.id;
  const adminId = req.user.id;

  try {
    const { rows } = await pool.query(
      `UPDATE transfers
         SET status = 'in_progress',
             claimed_by = $1,
             claimed_at = now()
       WHERE id = $2
         AND (status = 'pending' OR (status='in_progress' AND claimed_by = $1))
       RETURNING *`,
      [adminId, id]
    );

    if (!rows.length) {
      return res.status(409).json({ message: 'Already claimed by someone else or not pending.' });
    }

    return res.json(rows[0]);
  } catch (err) {
    console.error('❌ claim transfer error:', err);
    return res.status(500).json({ message: 'Failed to claim transfer.' });
  }
});

// --- release (admin; only holder) ------------------------------------------
router.post('/:id/release', authenticateToken, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const id = req.params.id;
  const adminId = req.user.id;

  try {
    const { rows } = await pool.query(
      `UPDATE transfers
         SET status = 'pending',
             claimed_by = NULL,
             claimed_at = NULL
       WHERE id = $1
         AND status = 'in_progress'
         AND claimed_by = $2
       RETURNING *`,
      [id, adminId]
    );

    if (!rows.length) {
      return res.status(409).json({ message: 'Not held by you or not in progress.' });
    }

    return res.json(rows[0]);
  } catch (err) {
    console.error('❌ release transfer error:', err);
    return res.status(500).json({ message: 'Failed to release transfer.' });
  }
});

// --- complete (admin; only holder) -----------------------------------------
router.post('/:id/complete', authenticateToken, async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const id = req.params.id;
  const adminId = req.user.id;
  const { bank_confirmation, treasury_wallet_id } = req.body || {};

  if (!bank_confirmation || !treasury_wallet_id) {
    return res.status(400).json({ message: 'bank_confirmation and treasury_wallet_id are required.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock transfer row
    const tRes = await client.query(
      `SELECT * FROM transfers WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (!tRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Transfer not found.' });
    }
    const t = tRes.rows[0];

    if (t.status !== 'in_progress' || t.claimed_by !== adminId) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Transfer is not in progress or not held by you.' });
    }

    // Debit treasury wallet balance
    const wRes = await client.query(
      `SELECT id, balance FROM wallets WHERE id = $1 FOR UPDATE`,
      [treasury_wallet_id]
    );
    if (!wRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Treasury wallet not found.' });
    }
    const wallet = wRes.rows[0];
    const amount = Number(t.amount_cents) / 100;

    const newBal = parseFloat(wallet.balance) - amount;
    if (newBal < 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Insufficient treasury funds.' });
    }

    await client.query(
      `UPDATE wallets SET balance = $1 WHERE id = $2`,
      [newBal, wallet.id]
    );

    // Insert a ledger row for the treasury debit
    await client.query(
      `INSERT INTO transactions (wallet_id, user_id, amount_cents, type, note)
       VALUES ($1, $2, $3, 'debit', $4)`,
      [
        wallet.id,
        adminId,
        t.amount_cents,
        `Bank payout for transfer ${t.id}. Conf: ${bank_confirmation}`
      ]
    );

    // Mark transfer completed
    const done = await client.query(
      `UPDATE transfers
         SET status = 'completed',
             bank_confirmation = $1,
             treasury_wallet_id = $2,
             completed_at = now()
       WHERE id = $3
       RETURNING *`,
      [bank_confirmation, treasury_wallet_id, id]
    );

    await client.query('COMMIT');
    return res.json(done.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ complete transfer error:', err);
    return res.status(500).json({ message: 'Failed to complete transfer.' });
  } finally {
    client.release();
  }
});

// --- fail (admin; holder or pending) ---------------------------------------
router.post('/:id/fail', authenticateToken, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const id = req.params.id;
  const adminId = req.user.id;
  const { reason } = req.body || {};

  try {
    const { rows } = await pool.query(
      `UPDATE transfers
         SET status = CASE
                        WHEN status = 'in_progress' AND claimed_by = $2 THEN 'failed'
                        WHEN status = 'pending' THEN 'failed'
                        ELSE status
                      END,
             failed_reason = $3,
             completed_at = CASE
                               WHEN status IN ('in_progress','pending') THEN now()
                               ELSE completed_at
                            END
       WHERE id = $1
       RETURNING *`,
      [id, adminId, reason || null]
    );

    if (!rows.length) return res.status(404).json({ message: 'Not found' });

    const updated = rows[0];
    if (updated.status !== 'failed') {
      return res.status(409).json({ message: 'Not allowed to fail this transfer (not pending or not held by you).' });
    }

    return res.json(updated);
  } catch (err) {
    console.error('❌ fail transfer error:', err);
    return res.status(500).json({ message: 'Failed to mark transfer failed.' });
  }
});

module.exports = router;
