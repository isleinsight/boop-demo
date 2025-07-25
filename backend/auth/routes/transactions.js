const express = require("express");
const router = express.Router();
const pool = require('../../db');
const authMiddleware = require("../middleware/auth"); // if you use auth

// POST /api/transactions/add-funds
router.post("/add-funds", authMiddleware, async (req, res) => {
  const { wallet_id, amount, note, added_by } = req.body;

  if (!wallet_id || !amount || isNaN(amount)) {
    return res.status(400).json({ error: "Missing or invalid fields." });
  }

  try {
    // Get active spending card for this wallet
    const cardRes = await db.query(
      `SELECT id FROM cards WHERE wallet_id = $1 AND type = 'spending' AND status = 'active' LIMIT 1`,
      [wallet_id]
    );

    if (!cardRes.rows.length) {
      return res.status(404).json({ error: "No active spending card found." });
    }

    const cardId = cardRes.rows[0].id;

    // Get user ID from wallet
    const userRes = await db.query(`SELECT user_id FROM wallets WHERE id = $1`, [wallet_id]);
    if (!userRes.rows.length) return res.status(404).json({ error: "Wallet not found." });

    const userId = userRes.rows[0].user_id;

    // Insert transaction
    await db.query(
      `INSERT INTO transactions (user_id, card_id, amount_cents, currency, type, note)
       VALUES ($1, $2, $3, 'BMD', 'load', $4)`,
      [userId, cardId, Math.round(parseFloat(amount) * 100), note || null]
    );

    // Update wallet balance
    await db.query(
      `UPDATE wallets SET balance = balance + $1 WHERE id = $2`,
      [parseFloat(amount), wallet_id]
    );

    res.status(200).json({ success: true });
  } catch (err) {
    console.error("Add funds error:", err);
    res.status(500).json({ error: "Internal server error." });
  }
});

module.exports = router;
