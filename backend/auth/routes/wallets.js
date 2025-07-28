const express = require("express");
const router = express.Router();
const db = require("../../db");
const { authenticateToken } = require("../middleware/authMiddleware");

// ✅ GET /api/wallets/user/:userId
router.get("/user/:userId", authenticateToken, async (req, res) => {
  const { userId } = req.params;

  try {
    const result = await db.query(
      `SELECT * FROM wallets WHERE user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Wallet not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("❌ Wallet fetch error:", err);
    res.status(500).json({ error: "Failed to fetch wallet" });
  }
});

// ✅ PATCH /api/wallets/:walletId
router.patch("/:walletId", authenticateToken, async (req, res) => {
  const { walletId } = req.params;
  const { status } = req.body;

  try {
    const result = await db.query(
      `UPDATE wallets SET status = $1 WHERE id = $2 RETURNING *`,
      [status, walletId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Wallet not found" });
    }

    res.json({ message: "Wallet updated", wallet: result.rows[0] });
  } catch (err) {
    console.error("❌ Wallet update error:", err);
    res.status(500).json({ error: "Failed to update wallet" });
  }
});

module.exports = router;
