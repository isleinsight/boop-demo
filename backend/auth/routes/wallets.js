// ./auth/routes/wallets.js
const express = require("express");
const router = express.Router();
const db = require("../../db");
const { authenticateToken } = require("../middleware/authMiddleware");

function isAdmin(req) {
  return (req.user?.role || "").toLowerCase() === "admin";
}

// ───────────────────────────────────────────────────────────────
// Health probes
router.get("/ping", (_req, res) => res.json({ ok: true, scope: "wallets" }));
router.get("/user/test", (_req, res) =>
  res.json({ ok: true, route: "/api/wallets/user/:userId" })
);

// ───────────────────────────────────────────────────────────────
// Helpers
async function parentLinkedToStudent(parentId, studentUserId) {
  const q = `
    SELECT 1
    FROM student_parents
    WHERE student_id = $1 AND parent_id = $2
    LIMIT 1
  `;
  const { rows } = await db.query(q, [studentUserId, parentId]);
  return rows.length > 0;
}

// ───────────────────────────────────────────────────────────────
// GET /api/wallets/mine  -> { wallet_id, balance_cents }
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
    if (!rows.length) return res.json({ wallet_id: null, balance_cents: 0 });

    const w = rows[0];
    return res.json({
      wallet_id: w.id,
      balance_cents: Number(w.balance || 0),
    });
  } catch (err) {
    console.error("❌ wallets/mine error:", err.stack || err);
    return res.status(500).json({ message: "Failed to load wallet." });
  }
});

// ✅ Alias so /api/wallets/me works (calls same logic as /mine)
router.get("/me", authenticateToken, async (req, res) => {
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
    if (!rows.length) return res.json({ wallet_id: null, balance_cents: 0 });

    const w = rows[0];
    return res.json({
      wallet_id: w.id,
      balance_cents: Number(w.balance || 0),
    });
  } catch (err) {
    console.error("❌ wallets/me error:", err.stack || err);
    return res.status(500).json({ message: "Failed to load wallet." });
  }
});

// ───────────────────────────────────────────────────────────────
// GET /api/wallets/user/:userId (admin or linked parent)
router.get("/user/:userId", authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;

    // Auth: admin OR linked parent
    if (!isAdmin(req)) {
      const requesterId = req.user?.userId ?? req.user?.id;
      const role = (req.user?.role || "").toLowerCase();
      if (role !== "parent") {
        return res.status(403).json({ message: "Admin or linked parent required." });
      }
      const linked = await parentLinkedToStudent(requesterId, userId);
      if (!linked) {
        return res.status(403).json({ message: "Not authorized for this student." });
      }
    }

    const q = `
      SELECT id, balance, is_frozen, frozen_at, frozen_by, frozen_reason
      FROM wallets
      WHERE user_id = $1
      ORDER BY created_at ASC
      LIMIT 1
    `;
    const { rows } = await db.query(q, [userId]);

    if (!rows.length) {
      return res.json({
        wallet_id: null,
        balance_cents: 0,
        is_frozen: false,
        frozen_at: null,
        frozen_by: null,
        frozen_reason: null,
      });
    }

    const w = rows[0];
    return res.json({
      wallet_id: w.id,
      balance_cents: Number(w.balance || 0),
      is_frozen: !!w.is_frozen,
      frozen_at: w.frozen_at,
      frozen_by: w.frozen_by,
      frozen_reason: w.frozen_reason || null,
    });
  } catch (err) {
    console.error("❌ wallets/user/:userId error:", err);
    return res.status(500).json({ message: "Failed to load wallet." });
  }
});

// … (rest of your parent-deposits, freeze, unfreeze, etc. unchanged) …

module.exports = router;
