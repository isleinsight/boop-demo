// backend/auth/routes/passport.js
const express = require("express");
const router = express.Router();
const db = require("../../db");
const { authenticateToken } = require("../middleware/authMiddleware");

// Allow: cardholder / student / senior (case-insensitive)
function requireCardholderLike(req, res, next) {
  const role = String(req.user?.role || "").toLowerCase();
  if (!["cardholder", "student", "senior"].includes(role)) {
    return res.status(403).json({ message: "Cardholder access required." });
  }
  next();
}

// GET /api/passport/mine  → { passport_id } | {}
router.get("/mine", authenticateToken, requireCardholderLike, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    const q = `SELECT passport_id FROM passport_ids WHERE user_id = $1 LIMIT 1`;
    const { rows } = await db.query(q, [userId]);
    return res.json(rows[0] || {});
  } catch (e) {
    console.error("GET /passport/mine error:", e);
    return res.status(500).json({ message: "Failed to load passport." });
  }
});

// PUT /api/passport/mine  body: { passport_id }
router.put("/mine", authenticateToken, requireCardholderLike, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    const raw = String(req.body?.passport_id || "").trim();

    // very light validation (A–Z, 0–9, dash/space, 4–64 chars)
    if (!/^[A-Za-z0-9\- ]{4,64}$/.test(raw)) {
      return res.status(400).json({ message: "Invalid passport format." });
    }

    const upsert = `
      INSERT INTO passport_ids (id, user_id, passport_id, created_at, updated_at)
      VALUES (gen_random_uuid(), $1, $2, NOW(), NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET passport_id = EXCLUDED.passport_id, updated_at = NOW()
      RETURNING passport_id
    `;
    const { rows } = await db.query(upsert, [userId, raw]);
    return res.json({ passport_id: rows[0].passport_id });
  } catch (e) {
    // unique violation on passport_id
    if (e?.code === "23505") {
      return res.status(409).json({ message: "Passport ID already in use." });
    }
    console.error("PUT /passport/mine error:", e);
    return res.status(500).json({ message: "Failed to save passport." });
  }
});

// (optional) DELETE /api/passport/mine
router.delete("/mine", authenticateToken, requireCardholderLike, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    await db.query(`DELETE FROM passport_ids WHERE user_id = $1`, [userId]);
    return res.json({ ok: true });
  } catch (e) {
    console.error("DELETE /passport/mine error:", e);
    return res.status(500).json({ message: "Failed to delete passport." });
  }
});

module.exports = router;
