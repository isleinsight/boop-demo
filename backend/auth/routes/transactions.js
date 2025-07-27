// auth/routes/transactions.js
const express = require("express");
const { authenticateToken } = require("../middleware/authMiddleware");
const router = express.Router();
const pool = require("../../db");
const { v4: uuidv4 } = require("uuid");

// 📥 Create a transaction
router.post("/", authenticateToken, async (req, res) => {
  const { wallet_id, amount_cents, type, method, description, reference_code, metadata } = req.body;

  if (!wallet_id || typeof amount_cents !== "number" || !type) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  if (!["adjustment_add", "adjustment_subtract"].includes(type)) {
    return res.status(400).json({ message: "Invalid transaction type" });
  }

  const txId = uuidv4();
  const userRes = await pool.query("SELECT user_id FROM wallets WHERE id = $1", [wallet_id]);

  if (userRes.rows.length === 0) {
    return res.status(404).json({ message: "Wallet not found" });
  }

  const user_id = userRes.rows[0].user_id;

  try {
    await pool.query(
      `INSERT INTO transactions (
        id, user_id, amount_cents, currency, type, method,
        description, category, reference_code, metadata, created_at, updated_at
      ) VALUES (
        $1, $2, $3, 'BMD', $4, $5, $6, 'admin_adjustment', $7, $8, NOW(), NOW()
      )`,
      [
        txId,
        user_id,
        amount_cents,
        type,
        method || "admin_manual",
        description || "",
        reference_code || null,
        metadata || {}
      ]
    );

    res.status(201).json({ message: "Transaction created", transaction_id: txId });
  } catch (err) {
    console.error("❌ Error inserting transaction:", err.message);
    res.status(500).json({ message: "Failed to create transaction" });
  }
});

// 📤 Get recent transactions
router.get("/", authenticateToken, async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const offset = parseInt(req.query.offset) || 0;

  try {
    const tx = await pool.query(
      `SELECT * FROM transactions ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    res.json(tx.rows);
  } catch (err) {
    console.error("❌ Error fetching transactions:", err.message);
    res.status(500).json({ message: "Failed to get transactions" });
  }
});

module.exports = router;
