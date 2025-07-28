const express = require("express");
const router = express.Router();
const db = require("../../db");

// ✅ GET /api/wallets/user/:userId — Fetch wallet by user ID
router.get("/user/:userId", async (req, res) => {
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
    console.error("❌ Error fetching wallet:", err);
    res.status(500).json({ error: "Failed to fetch wallet" });
  }
});

// ✅ PATCH /api/wallets/:walletId — Update wallet status
router.patch("/:walletId", async (req, res) => {
  const { walletId } = req.params;
  const { status } = req.body;

  const validStatuses = ["active", "suspended", "archived", "pending"];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: "Invalid wallet status" });
  }

  try {
    const result = await db.query(
      `UPDATE wallets SET status = $1 WHERE id = $2 RETURNING *`,
      [status, walletId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Wallet not found" });
    }

    res.json({ message: "Wallet status updated", wallet: result.rows[0] });
  } catch (err) {
    console.error("❌ Error updating wallet:", err);
    res.status(500).json({ error: "Failed to update wallet status" });
  }
});

module.exports = router;
