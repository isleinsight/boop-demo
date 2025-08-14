// ./auth/routes/wallets.js
const express = require("express");
const router = express.Router();
const db = require("../../db");
const { authenticateToken } = require("../middleware/authMiddleware");

/** Admin-only guard */
function requireAdmin(req, res, next) {
  const role = (req.user?.role || "").toLowerCase();
  if (role !== "admin") return res.status(403).json({ message: "Admin access required." });
  next();
}

/**
 * GET /api/wallets/mine — current user's wallet summary
 * Shape: { wallet_id, balance_cents }
 */
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
      return res.json({ wallet_id: null, balance_cents: 0 });
    }

    const w = rows[0];
    return res.json({
      wallet_id: w.id,
      // your schema stores cents as an integer column named "balance"
      balance_cents: Number(w.balance || 0)
    });
  } catch (err) {
    console.error("❌ wallets/mine error:", err.stack || err);
    return res.status(500).json({ message: "Failed to load wallet." });
  }
});

/**
 * GET /api/wallets/user/:userId — admin-only wallet summary for any user
 * Returns the SAME shape as /mine so front-ends can reuse code:
 * { wallet_id, balance_cents }
 */
router.get("/user/:userId", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    const q = `
      SELECT id, balance
      FROM wallets
      WHERE user_id = $1
      ORDER BY created_at ASC
      LIMIT 1
    `;
    const { rows } = await db.query(q, [userId]);

    if (!rows.length) {
      return res.json({ wallet_id: null, balance_cents: 0 });
    }

    const w = rows[0];
    return res.json({
      wallet_id: w.id,
      balance_cents: Number(w.balance || 0)
    });
  } catch (err) {
    console.error("❌ wallets/user/:userId error:", err);
    return res.status(500).json({ message: "Failed to load wallet." });
  }
});

module.exports = router;
