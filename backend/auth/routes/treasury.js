// backend/auth/routes/treasury.js
const express = require("express");
const router = express.Router();
const db = require("../../db");
const authenticateToken = require("../middleware/authMiddleware");

// POST /api/treasury/adjust
router.post("/adjust", authenticateToken, async (req, res) => {
  const { wallet_id, amount, note } = req.body;
  const user = req.user;

  // ✅ Validation
  if (!wallet_id || typeof amount !== "number" || !note) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  if (!user || (user.role !== "admin" && user.type !== "treasury")) {
    return res.status(403).json({ error: "Not authorized" });
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    // ✅ Check wallet exists
    const walletCheck = await client.query(
      `SELECT balance FROM wallets WHERE id = $1`,
      [wallet_id]
    );
    if (walletCheck.rowCount === 0) {
      throw new Error("Wallet not found");
    }

    // ✅ Insert transaction
    const insertTxn = await client.query(
      `INSERT INTO transactions (
        amount,
        from_wallet_id,
        to_wallet_id,
        note,
        created_by,
        category
      ) VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        'treasury-adjustment'
      ) RETURNING id`,
      [
        Math.abs(amount),
        amount < 0 ? wallet_id : null,
        amount > 0 ? wallet_id : null,
        note,
        user.id
      ]
    );

    const txnId = insertTxn.rows[0].id;

    // ✅ Update wallet balance
    await client.query(
      `UPDATE wallets
       SET balance = COALESCE(balance, 0) + $1
       WHERE id = $2`,
      [amount, wallet_id]
    );

    await client.query("COMMIT");

    return res.status(200).json({
      message: "Adjustment successful",
      transaction_id: txnId
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Adjustment failed:", err.message);
    return res.status(500).json({ error: "Adjustment failed" });
  } finally {
    client.release();
  }
});

module.exports = router;
