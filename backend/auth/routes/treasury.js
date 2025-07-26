const express = require("express");
const router = express.Router();
const pool = require("../../db");
const authenticateToken = require("../middleware/authMiddleware");

// 🔐 Check for Treasury Admin
function isTreasuryAdmin(req, res, next) {
  const { role, type } = req.user;
  if (role === "admin" && type === "treasury") return next();
  return res.status(403).json({ error: "Access denied" });
}

// ✅ GET /api/treasury/balance/:wallet_id
router.get("/balance/:wallet_id", authenticateToken, isTreasuryAdmin, async (req, res) => {
  const { wallet_id } = req.params;

  try {
    const result = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS balance FROM transactions WHERE wallet_id = $1`,
      [wallet_id]
    );

    const balance = parseFloat(result.rows[0].balance || 0);
    res.json({ balance });
  } catch (err) {
    console.error("❌ Failed to get treasury balance:", err);
    res.status(500).json({ error: "Failed to get balance" });
  }
});

// ✅ POST /api/treasury/adjust
router.post("/adjust", authenticateToken, isTreasuryAdmin, async (req, res) => {
  const { wallet_id, amount, note } = req.body;

  if (!wallet_id || isNaN(amount) || !note || note.trim() === "") {
    return res.status(400).json({ error: "Invalid input" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO transactions (wallet_id, amount, type, note, category, status, created_by)
       VALUES ($1, $2, 'adjustment', $3, 'treasury', 'approved', $4)`,
      [wallet_id, amount, note.trim(), req.user.id] // ✅ fixed: req.user.id
    );

    await client.query("COMMIT");
    res.json({ message: "Adjustment recorded" });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Treasury adjustment failed:", err);
    res.status(500).json({ error: "Adjustment failed" });
  } finally {
    client.release();
  }
});

module.exports = router;
