// backend/auth/routes/treasury.js
const express = require("express");
const router = express.Router();
const pool = require("../../db");
const { authenticateToken } = require("../middleware/authMiddleware");

// ✅ Get the signed-in user's wallet balance
router.get("/balance", authenticateToken, async (req, res) => {
  const userId = req.user?.id || req.user?.userId;

  try {
    const result = await pool.query(
      "SELECT balance_cents FROM wallets WHERE user_id = $1",
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Wallet not found" });
    }

    const balance = result.rows[0].balance_cents;
    res.json({ balance_cents: balance });
  } catch (err) {
    console.error("❌ Error fetching balance:", err.message);
    res.status(500).json({ message: "Internal server error" });
  }
});

// ✅ Adjust balance for the signed-in treasury user
router.post("/adjust", authenticateToken, async (req, res) => {
  const userId = req.user?.id || req.user?.userId;
  const { amount_cents, type, note } = req.body;

  if (!["credit", "debit"].includes(type)) {
    return res.status(400).json({ message: "Invalid adjustment type" });
  }

  if (!amount_cents || amount_cents <= 0 || !note) {
    return res.status(400).json({ message: "Amount and note required" });
  }

  const multiplier = type === "credit" ? 1 : -1;

  try {
    // ✅ Update balance
    const updateQuery = `
      UPDATE wallets
      SET balance_cents = balance_cents + $1
      WHERE user_id = $2
      RETURNING balance_cents
    `;

    const updated = await pool.query(updateQuery, [
      amount_cents * multiplier,
      userId,
    ]);

    if (updated.rows.length === 0) {
      return res.status(404).json({ message: "Wallet not found" });
    }

    // ✅ Optional: log to treasury_transactions
    await pool.query(
      `INSERT INTO treasury_transactions (user_id, amount_cents, type, note, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [userId, amount_cents, type, note]
    );

    res.json({
      message: "Adjustment successful",
      new_balance_cents: updated.rows[0].balance_cents,
    });
  } catch (err) {
    console.error("❌ Error submitting adjustment:", err.message);
    res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;
