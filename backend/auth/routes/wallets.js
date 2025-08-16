// ./auth/routes/wallets.js
const express = require("express");
const router = express.Router();
const db = require("../../db");
const { authenticateToken } = require("../middleware/authMiddleware");

function isAdmin(req) {
  return (req.user?.role || "").toLowerCase() === "admin";
}

// ✅ TEMP: quick health checks to verify mounting & path
router.get("/ping", (_req, res) => res.json({ ok: true, scope: "wallets" }));
router.get("/user/test", (_req, res) =>
  res.json({ ok: true, route: "/api/wallets/user/:userId" })
);

// ✅ Your schema: student_parents(student_id, parent_id)
// student_id == student's users.id (same as students.user_id)
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

/**
 * GET /api/wallets/mine — (unchanged)
 * returns: { wallet_id, balance_cents }
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

    if (!rows.length) return res.json({ wallet_id: null, balance_cents: 0 });

    const w = rows[0];
    return res.json({ wallet_id: w.id, balance_cents: Number(w.balance || 0) });
  } catch (err) {
    console.error("❌ wallets/mine error:", err.stack || err);
    return res.status(500).json({ message: "Failed to load wallet." });
  }
});

/**
 * GET /api/wallets/user/:userId
 * Admin OR parent linked to that student.
 * Response: { wallet_id, balance_cents }
 */
router.get("/user/:userId", authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;

    // Auth: admin ok; otherwise must be a parent linked to this student
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
      SELECT id, balance
      FROM wallets
      WHERE user_id = $1
      ORDER BY created_at ASC
      LIMIT 1
    `;
    const { rows } = await db.query(q, [userId]);

    if (!rows.length) return res.json({ wallet_id: null, balance_cents: 0 });

    const w = rows[0];
    return res.json({ wallet_id: w.id, balance_cents: Number(w.balance || 0) });
  } catch (err) {
    console.error("❌ wallets/user/:userId error:", err);
    return res.status(500).json({ message: "Failed to load wallet." });
  }
});

module.exports = router;
