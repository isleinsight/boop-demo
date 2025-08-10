// ./auth/routes/wallets.js
const express = require("express");
const router = express.Router();
const db = require("../../db");
const { authenticateToken } = require("../middleware/authMiddleware");

// GET /api/wallets/mine  — current user's wallet summary
router.get("/mine", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId ?? req.user?.id;
    if (!userId) return res.status(400).json({ message: "No user id in token." });

    const q = `
      SELECT id, balance
      FROM wallets
      WHERE user_id = $1
      ORDER BY created_at ASC
      LIMIT 1
    `;
    const { rows } = await db.query(q, [userId]);

    if (!rows.length) {
      // return the shape your client expects
      return res.json({ wallet_id: null, balance_cents: 0 });
    }

    const w = rows[0];
    return res.json({
      wallet_id: w.id,
      balance_cents: Number(w.balance || 0) // your schema stores cents in integer
    });
  } catch (err) {
    console.error("❌ wallets/mine error:", err.stack || err);
    return res.status(500).json({ message: "Failed to load wallet." });
  }
});

/**
 * GET /api/wallets/user/:userId — keep your existing route
 */
router.get("/user/:userId", async (req, res) => {
  const { userId } = req.params;
  try {
    const result = await db.query(`SELECT * FROM wallets WHERE user_id = $1`, [userId]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Wallet not found" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error fetching wallet:", err);
    res.status(500).json({ error: "Failed to fetch wallet" });
  }
});

module.exports = router;
