// ./auth/routes/wallets.js
const express = require("express");
const router = express.Router();
const db = require("../../db");
const { authenticateToken } = require("../middleware/authMiddleware");

function isAdmin(req) {
  return (req.user?.role || "").toLowerCase() === "admin";
}

/**
 * Returns true if parentId is linked to studentUserId.
 * Adjust table/column names if yours differ.
 */
async function parentLinkedToStudent(parentId, studentUserId) {
  // Option A: students table stores user_id (child) and parent_id (parent)
  const qA = `
    SELECT 1
    FROM students
    WHERE user_id = $1 AND parent_id = $2
    LIMIT 1
  `;
  const a = await db.query(qA, [studentUserId, parentId]);
  if (a.rows.length) return true;

  // Option B: mapping table student_parents(student_id, parent_id) + users.id for student
  // const qB = `
  //   SELECT 1
  //   FROM student_parents sp
  //   JOIN students s ON s.id = sp.student_id
  //   WHERE s.user_id = $1 AND sp.parent_id = $2
  //   LIMIT 1
  // `;
  // const b = await db.query(qB, [studentUserId, parentId]);
  // if (b.rows.length) return true;

  return false;
}

/**
 * GET /api/wallets/mine — unchanged
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
 * Old behavior: admin-only.
 * New behavior: admin OR parent linked to the student (userId).
 * Response unchanged: { wallet_id, balance_cents }
 */
router.get("/user/:userId", authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;

    // Authorize
    if (!isAdmin(req)) {
      const requesterId = req.user?.userId ?? req.user?.id;
      const requesterRole = (req.user?.role || "").toLowerCase();
      if (requesterRole !== "parent") {
        return res.status(403).json({ message: "Admin or linked parent required." });
      }
      const linked = await parentLinkedToStudent(requesterId, userId);
      if (!linked) {
        return res.status(403).json({ message: "Not authorized for this student." });
      }
    }

    // Same lookup as before
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
