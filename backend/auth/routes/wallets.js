// ./auth/routes/wallets.js
const express = require("express");
const router = express.Router();
const db = require("../../db");
const { authenticateToken } = require("../middleware/authMiddleware");

/**
 * GET /api/wallets/mine
 * Returns the current user's wallet summary for the UI.
 * Front-end expects: { wallet_id, balance_cents }
 */
router.get("/mine", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;

    // Adjust columns if yours differ (e.g., balance vs balance_cents)
    const q = `
      SELECT id, user_id,
             -- If your table stores dollars as decimal, convert to cents:
             -- (balance * 100)::bigint AS balance_cents
             COALESCE(balance_cents, (balance * 100))::bigint AS balance_cents
      FROM wallets
      WHERE user_id = $1
      LIMIT 1
    `;
    const { rows } = await db.query(q, [userId]);

    if (!rows.length) {
      return res.json({ wallet_id: null, balance_cents: 0 });
    }

    const w = rows[0];
    res.json({
      wallet_id: w.id,
      balance_cents: Number(w.balance_cents || 0)
    });
  } catch (err) {
    console.error("❌ wallets/mine error:", err);
    res.status(500).json({ message: "Failed to load wallet." });
  }
});

/**
 * GET /api/wallets/user/:userId
 * Your existing route (unchanged)
 */
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

module.exports = router;
