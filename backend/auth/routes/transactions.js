const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { authenticateToken } = require('../middleware/authMiddleware');

// 🔍 GET /api/transactions/recent
router.get('/recent', authenticateToken, async (req, res) => {
  const { role, type } = req.user;
  if (role !== 'admin' || !['accountant', 'treasury'].includes(type)) {
    return res.status(403).json({ message: 'You do not have permission to view these transactions.' });
  }
  try {
    const result = await pool.query(`
      SELECT
        t.id,
        t.user_id,
        t.wallet_id,
        t.type,
        t.amount_cents,
        t.note,
        t.created_at,
        COALESCE(
          v.business_name,
          u.first_name || ' ' || COALESCE(u.last_name, ''),
          'System'
        ) AS counterparty_name
      FROM transactions t
      LEFT JOIN vendors v ON v.id = t.vendor_id
      LEFT JOIN users u ON u.id = t.added_by
      ORDER BY t.created_at DESC
      LIMIT 50
    `);
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('❌ Failed to load transactions:', err.message);
    res.status(500).json({ message: 'An error occurred while retrieving transactions.' });
  }
});

// 👤 GET /api/transactions/mine
router.get('/mine', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  try {
    const result = await pool.query(`
      SELECT
        id,
        wallet_id,
        type,
        amount_cents,
        note,
        created_at
      FROM transactions
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 50
    `, [userId]);
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('❌ Failed to load user transactions:', err.message);
    res.status(500).json({ message: 'An error occurred while retrieving your transactions.' });
  }
});

// 📊 GET /api/transactions/report
router.get('/report', authenticateToken, async (req, res) => {
  const { role, type } = req.user;
  const { start, end, type: filterType } = req.query;
  if (role !== 'admin' || !['accountant', 'treasury'].includes(type)) {
    return res.status(403).json({ message: 'You do not have permission to view these transactions.' });
  }
  const values = [];
  const conditions = [];
  if (start) {
    values.push(start);
    conditions.push(`t.created_at >= $${values.length}`);
  }
  if (end) {
    values.push(end);
    conditions.push(`t.created_at <= $${values.length}`);
  }
  if (filterType) {
    values.push(filterType);
    conditions.push(`t.type = $${values.length}`);
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  try {
    const result = await pool.query(`
      SELECT
        t.id,
        t.user_id,
        t.wallet_id,
        t.type,
        t.amount_cents,
        t.note,
        t.created_at,
        COALESCE(
          v.business_name,
          u.first_name || ' ' || COALESCE(u.last_name, ''),
          'System'
        ) AS counterparty_name
      FROM transactions t
      LEFT JOIN vendors v ON v.id = t.vendor_id
      LEFT JOIN users u ON u.id = t.added_by
      ${whereClause}
      ORDER BY t.created_at DESC
      LIMIT 200
    `, values);
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('❌ Error loading transaction report:', err.message);
    res.status(500).json({ message: 'An error occurred while retrieving report transactions.' });
  }
});


const express = require("express");
const router = express.Router();
const db = require("../../db");
const { authMiddleware } = require("../../middleware/auth");

router.post("/add-funds", authMiddleware, async (req, res) => {
  const client = await db.connect();
  try {
    const { wallet_id, user_id, amount, note, added_by, treasury_wallet_id } = req.body;

    console.log("📥 Incoming Add Funds Request:");
    console.log("Recipient Wallet ID:", wallet_id);
    console.log("Recipient User ID:", user_id);
    console.log("Amount:", amount);
    console.log("Note:", note);
    console.log("Added By (Admin ID):", added_by);
    console.log("Treasury Wallet ID:", treasury_wallet_id);

    const amount_cents = Math.round(parseFloat(amount) * 100);
    const debitNote = note || "Funds issued";

    await client.query("BEGIN");

    // 🔎 Get treasury wallet owner
    const treasuryResult = await client.query(
      `SELECT user_id FROM wallets WHERE id = $1`,
      [treasury_wallet_id]
    );

    if (treasuryResult.rowCount === 0) {
      throw new Error("Treasury wallet not found");
    }

    const treasuryUserId = treasuryResult.rows[0].user_id;
    console.log("🧾 Treasury wallet owned by user:", treasuryUserId);

    // 💸 Debit from treasury
    await client.query(
      `INSERT INTO transactions (
        wallet_id, user_id, type, amount_cents, note, created_at,
        added_by, sender_id, recipient_id
      )
      VALUES ($1, $2, 'debit', $3, $4, NOW(), $5, $6, $7)`,
      [
        treasury_wallet_id,
        treasuryUserId,
        amount_cents,
        debitNote,
        added_by,
        treasuryUserId,
        user_id
      ]
    );
    console.log("✅ Treasury debit transaction inserted");

    // 💰 Credit to user
    await client.query(
      `INSERT INTO transactions (
        wallet_id, user_id, type, amount_cents, note, created_at,
        added_by, sender_id, recipient_id
      )
      VALUES ($1, $2, 'credit', $3, 'Received from Government Assistance', NOW(), NULL, NULL, $2)`,
      [
        wallet_id,
        user_id,
        amount_cents
      ]
    );
    console.log("✅ Recipient credit transaction inserted");

    await client.query("COMMIT");

    res.status(200).json({ message: "Funds added successfully" });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Add Funds Error:", err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;

// 📄 GET /api/transactions/user/:userId
router.get('/user/:userId', authenticateToken, async (req, res) => {
  const { role } = req.user;
  const { userId } = req.params;
  const limit = parseInt(req.query.limit) || 10;
  const offset = parseInt(req.query.offset) || 0;

  if (role !== 'admin') {
    return res.status(403).json({ message: 'You do not have permission to view these transactions.' });
  }

  try {
    const result = await pool.query(`
      SELECT
        t.id,
        t.wallet_id,
        t.type,
        t.amount_cents,
        t.note,
        t.created_at,
        t.sender_id,
        t.recipient_id,

        -- 🧠 Get sender name, fallback to 'Government Assistance'
        CASE
          WHEN senders.id IS NOT NULL THEN
            senders.first_name || ' ' || COALESCE(senders.last_name, '')
          ELSE 'Government Assistance'
        END AS sender_name,

        -- 🧠 Get recipient name, fallback to 'Unknown'
        CASE
          WHEN recipients.id IS NOT NULL THEN
            recipients.first_name || ' ' || COALESCE(recipients.last_name, '')
          ELSE 'Unknown Recipient'
        END AS recipient_name

      FROM transactions t
      LEFT JOIN users senders ON senders.id = t.sender_id
      LEFT JOIN users recipients ON recipients.id = t.recipient_id
      WHERE t.user_id = $1
      ORDER BY t.created_at DESC
      LIMIT $2 OFFSET $3
    `, [userId, limit, offset]);

    console.log(`📦 Fetching transactions for user ${userId} - Found ${result.rows.length} transactions`);

    result.rows.forEach(row => {
      console.log(`🔁 TX ${row.id}: FROM ${row.sender_name} TO ${row.recipient_name} | $${(row.amount_cents / 100).toFixed(2)}`);
    });

    const countRes = await pool.query(
      `SELECT COUNT(*) FROM transactions WHERE user_id = $1`,
      [userId]
    );

    res.status(200).json({
      transactions: result.rows,
      totalCount: parseInt(countRes.rows[0].count, 10)
    });

  } catch (err) {
    console.error('❌ Failed to load target user transactions:', err.message);
    res.status(500).json({ message: 'An error occurred while retrieving transactions.' });
  }
});

module.exports = router;
