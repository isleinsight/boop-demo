// backend/auth/routes/treasury.js

const express = require("express");
const router = express.Router();
const pool = require("../../db");
const authenticateToken = require("../middleware/authMiddleware");

// 🔐 Middleware: Only treasury admins
function isTreasuryAdmin(req, res, next) {
  const { role, type } = req.user;
  if (role === "admin" && type === "treasury") return next();
  return res.status(403).json({ error: "Access denied" });
}

// ✅ GET /api/treasury/balance
router.get("/balance", authenticateToken, isTreasuryAdmin, async (req, res) => {
  try {
    // Step 1: Get wallet for this user
    const userId = req.user.id;
    const walletResult = await pool.query(
      "SELECT id FROM wallets WHERE user_id = $1 LIMIT 1",
      [userId]
    );

    if (walletResult.rows.length === 0) {
      return res.status(404).json({ error: "Wallet not found for user" });
    }

    const walletId = walletResult.rows[0].id;

    // Step 2: Fetch balance from transactions table
    const result = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS balance FROM transactions WHERE wallet_id = $1`,
      [walletId]
    );

    const balance = result.rows[0].balance;
    res.json({ balance, wallet_id: walletId });
  } catch (err) {
    console.error("❌ Failed to get treasury balance:", err);
    res.status(500).json({ error: "Failed to get balance" });
  }
});

// ✅ POST /api/treasury/adjust
router.post("/adjust", authenticateToken, isTreasuryAdmin, async (req, res) => {
  const { amount, note } = req.body;

  if (isNaN(amount) || !note || note.trim() === "") {
    return res.status(400).json({ error: "Invalid input" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Get wallet again for this user
    const walletResult = await client.query(
      "SELECT id FROM wallets WHERE user_id = $1 LIMIT 1",
      [req.user.id]
    );

    if (walletResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Wallet not found" });
    }

    const walletId = walletResult.rows[0].id;

    await client.query(
      `INSERT INTO transactions (wallet_id, amount, type, note, category, status, created_by)
       VALUES ($1, $2, 'adjustment', $3, 'treasury', 'approved', $4)`,
      [walletId, amount, note.trim(), req.user.id]
    );

    await client.query("COMMIT");
    res.json({ message: "Adjustment recorded", wallet_id: walletId });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Treasury adjustment failed:", err);
    res.status(500).json({ error: "Adjustment failed" });
  } finally {
    client.release();
  }
});

module.exports = router;
