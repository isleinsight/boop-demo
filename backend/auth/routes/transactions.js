// routes/transactions.js
const express = require('express');
const router = express.Router();

const pool = require('../../db'); // <-- your pg Pool
const { authenticateToken } = require('../middleware/authMiddleware'); // <-- your auth

// Helper fragment used in multiple queries to resolve names
const NAME_FIELDS_SQL = `
  t.sender_id,
  t.receiver_id,
  COALESCE(
    (sender.first_name || ' ' || COALESCE(sender.last_name, ''))::text,
    'Government Assistance'
  ) AS sender_name,
  COALESCE(
    (receiver.first_name || ' ' || COALESCE(receiver.last_name, ''))::text,
    'Unknown Recipient'
  ) AS receiver_name
`;

// 🔍 GET /api/transactions/recent  (admins: accountant or treasury)
router.get('/recent', authMiddleware, async (req, res) => {
  const { role, type } = req.user;
  if (role !== 'admin' || !['accountant', 'treasury'].includes(type)) {
    return res.status(403).json({ message: 'You do not have permission to view these transactions.' });
  }

  try {
    const { rows } = await db.query(`
      SELECT
        t.id,
        t.user_id,
        t.wallet_id,
        t.type,                 -- 'debit' | 'credit'
        t.amount_cents,
        t.note,
        t.created_at,
        t.sender_id,
        t.recipient_id,

        -- Names
        (COALESCE(s.first_name,'') || ' ' || COALESCE(s.last_name,''))::text AS sender_name,
        (COALESCE(r.first_name,'') || ' ' || COALESCE(r.last_name,''))::text AS recipient_name,

        -- Legacy field many pages expect
        CASE
          WHEN t.type = 'debit'  THEN (COALESCE(r.first_name,'') || ' ' || COALESCE(r.last_name,''))
          WHEN t.type = 'credit' THEN (COALESCE(s.first_name,'') || ' ' || COALESCE(s.last_name,''))
          ELSE (COALESCE(s.first_name,'') || ' ' || COALESCE(s.last_name,''))
        END::text AS counterparty_name
      FROM transactions t
      LEFT JOIN users s ON s.id = t.sender_id
      LEFT JOIN users r ON r.id = t.recipient_id
      ORDER BY t.created_at DESC
      LIMIT 50
    `);

    return res.status(200).json(rows);
  } catch (err) {
    console.error('❌ Failed to load recent transactions:', err);
    return res.status(500).json({ message: 'An error occurred while retrieving transactions.' });
  }
});

// 👤 GET /api/transactions/mine  (current user)
router.get('/mine', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  try {
    const { rows } = await pool.query(`
      SELECT
        t.id,
        t.wallet_id,
        t.type,
        t.amount_cents,
        t.note,
        t.created_at,
        ${NAME_FIELDS_SQL}
      FROM transactions t
      LEFT JOIN users sender   ON sender.id   = t.sender_id
      LEFT JOIN users receiver ON receiver.id = t.receiver_id
      WHERE t.user_id = $1
      ORDER BY t.created_at DESC
      LIMIT 50
    `, [userId]);

    return res.status(200).json(rows);
  } catch (err) {
    console.error('❌ Failed to load user transactions:', err);
    return res.status(500).json({ message: 'An error occurred while retrieving your transactions.' });
  }
});

// 📊 GET /api/transactions/report  (admin: accountant/treasury)
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
    const { rows } = await pool.query(`
      SELECT
        t.id,
        t.user_id,
        t.wallet_id,
        t.type,
        t.amount_cents,
        t.note,
        t.created_at,
        ${NAME_FIELDS_SQL}
      FROM transactions t
      LEFT JOIN users sender   ON sender.id   = t.sender_id
      LEFT JOIN users receiver ON receiver.id = t.receiver_id
      ${whereClause}
      ORDER BY t.created_at DESC
      LIMIT 200
    `, values);

    return res.status(200).json(rows);
  } catch (err) {
    console.error('❌ Error loading transaction report:', err);
    return res.status(500).json({ message: 'An error occurred while retrieving report transactions.' });
  }
});

// 📄 GET /api/transactions/user/:userId  (admin only)
router.get('/user/:userId', authMiddleware, async (req, res) => {
  const { role } = req.user;
  if (role !== 'admin') {
    return res.status(403).json({ message: 'You do not have permission to view these transactions.' });
  }

  const { userId } = req.params;
  const limit  = parseInt(req.query.limit, 10)  || 10;
  const offset = parseInt(req.query.offset, 10) || 0;

  try {
    const txRes = await db.query(`
      SELECT
        t.id,
        t.wallet_id,
        t.type,
        t.amount_cents,
        t.note,
        t.created_at,
        t.sender_id,
        t.recipient_id,

        (COALESCE(s.first_name,'') || ' ' || COALESCE(s.last_name,''))::text AS sender_name,
        (COALESCE(r.first_name,'') || ' ' || COALESCE(r.last_name,''))::text AS recipient_name,

        CASE
          WHEN t.type = 'debit'  THEN (COALESCE(r.first_name,'') || ' ' || COALESCE(r.last_name,''))
          WHEN t.type = 'credit' THEN (COALESCE(s.first_name,'') || ' ' || COALESCE(s.last_name,''))
          ELSE (COALESCE(s.first_name,'') || ' ' || COALESCE(s.last_name,''))
        END::text AS counterparty_name
      FROM transactions t
      LEFT JOIN users s ON s.id = t.sender_id
      LEFT JOIN users r ON r.id = t.recipient_id
      WHERE t.user_id = $1
      ORDER BY t.created_at DESC
      LIMIT $2 OFFSET $3
    `, [userId, limit, offset]);

    const countRes = await db.query(
      `SELECT COUNT(*)::int AS count FROM transactions WHERE user_id = $1`,
      [userId]
    );

    // Optional debugging
    txRes.rows.forEach(row => {
      console.log(`🔁 TX ${row.id}: ${row.type.toUpperCase()} | FROM ${row.sender_name} → TO ${row.recipient_name} | $${(row.amount_cents/100).toFixed(2)}`);
    });

    return res.status(200).json({
      transactions: txRes.rows,
      totalCount: countRes.rows[0].count
    });
  } catch (err) {
    console.error('❌ Failed to load user transactions:', err);
    return res.status(500).json({ message: 'An error occurred while retrieving transactions.' });
  }
});

// 💰 POST /api/transactions/add-funds
router.post("/add-funds", authMiddleware, async (req, res) => {
  const client = await db.connect();

  try {
    const { role, type, id: adminId } = req.user;

    // Only accountants or treasury admins can do this
    if (role !== "admin" || !["accountant", "treasury"].includes(type)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { wallet_id, user_id, amount, note, added_by, treasury_wallet_id } = req.body;

    if (!treasury_wallet_id || !wallet_id || !user_id || !amount) {
      return res.status(400).json({ message: "Missing required fields." });
    }

    console.log("📥 Incoming Add Funds Request:");
    console.log("Treasury Wallet ID:", treasury_wallet_id);
    console.log("Recipient Wallet ID:", wallet_id);
    console.log("Recipient User ID:", user_id);
    console.log("Amount:", amount);
    console.log("Note:", note);
    console.log("Added By (Admin ID):", added_by || adminId);

    const amount_cents = Math.round(parseFloat(amount) * 100);
    const debitNote = note || "Funds issued";
    const creditNote = "Received from Government Assistance";

    await client.query("BEGIN");

    // 🔎 Get treasury wallet owner (they are the sender)
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
        treasury_wallet_id,           // wallet being debited
        treasuryUserId,               // owner of treasury wallet
        amount_cents,
        debitNote,
        added_by || adminId,          // admin who performed this
        treasuryUserId,               // sender = treasury owner
        user_id                        // recipient = target user
      ]
    );
    console.log("✅ Treasury debit transaction inserted");

    // 💰 Credit to user
    await client.query(
      `INSERT INTO transactions (
        wallet_id, user_id, type, amount_cents, note, created_at,
        added_by, sender_id, recipient_id
      )
      VALUES ($1, $2, 'credit', $3, $4, NOW(), $5, $6, $7)`,
      [
        wallet_id,                     // wallet being credited
        user_id,                        // recipient user
        amount_cents,
        creditNote,
        added_by || adminId,
        treasuryUserId,                 // sender = treasury owner
        user_id                          // recipient = target user
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
