const express = require("express");
const router = express.Router();
const pool = require("../../db");
const authenticateToken = require("../middleware/authMiddleware");

router.get("/balance/:wallet_id", authenticateToken, async (req, res) => {
  const { wallet_id } = req.params;

  try {
    // 💸 Sum of incoming funds (credits)
    const creditRes = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS credits
       FROM transactions
       WHERE to_wallet_id = $1 AND status = 'completed'`,
      [wallet_id]
    );

    // 💳 Sum of outgoing funds (debits)
    const debitRes = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS debits
       FROM transactions
       WHERE from_wallet_id = $1 AND status = 'completed'`,
      [wallet_id]
    );

    const credits = parseFloat(creditRes.rows[0].credits);
    const debits = parseFloat(debitRes.rows[0].debits);
    const balance = credits - debits;

    res.json({
      wallet_id,
      balance: Number(balance.toFixed(2)),
      credits,
      debits
    });
  } catch (err) {
    console.error("❌ Error fetching treasury balance:", err);
    res.status(500).json({ message: "Failed to fetch balance" });
  }
});

module.exports = router;
