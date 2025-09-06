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
    const q = `SELECT passport_id FROM passports WHERE user_id = $1 LIMIT 1`;
    const { rows } = await db.query(q, [userId]);
    return res.json(rows[0] || {});
  } catch (e) {
    console.error("GET /passport/mine error:", e);
    return res.status(500).json({ message: "Failed to load passport." });
  }
});

// PUT /api/passport/mine  body: { passport_id }
router.put("/mine", authenticateToken, requireCardholderLike, async (req, res) => {
  const client = await db.connect();
  try {
    const userId = req.user?.userId || req.user?.id;
    const raw = String(req.body?.passport_id || "").trim();

    // very light validation (A–Z, 0–9, dash/space, 4–64 chars)
    if (!/^[A-Za-z0-9\- ]{4,64}$/.test(raw)) {
      client.release();
      return res.status(400).json({ message: "Invalid passport format." });
    }

    await client.query("BEGIN");

    // Uniqueness: is this passport_id already used by someone else?
    const inUse = await client.query(
      `SELECT 1 FROM passports WHERE LOWER(passport_id) = LOWER($1) AND user_id <> $2 LIMIT 1`,
      [raw, userId]
    );
    if (inUse.rowCount) {
      await client.query("ROLLBACK");
      client.release();
      return res.status(409).json({ message: "Passport ID already in use." });
    }

    // Try update first
    const upd = await client.query(
  `UPDATE passports
     SET passport_id = $1,
         pid_token = COALESCE(pid_token, encode(gen_random_bytes(12), 'hex')),
         pid_created_at = COALESCE(pid_created_at, NOW()),
         updated_at = NOW()
   WHERE user_id = $2
   RETURNING passport_id, pid_token`,
  [raw, userId]
);

    let passportRow = upd.rows[0];

    // If nothing updated, insert
    if (!passportRow) {
      const ins = await client.query(
  `INSERT INTO passports (id, user_id, passport_id, pid_token, pid_created_at, created_at, updated_at)
   VALUES (gen_random_uuid(), $1, $2, encode(gen_random_bytes(12), 'hex'), NOW(), NOW(), NOW())
   RETURNING passport_id, pid_token`,
  [userId, raw]
);
passportRow = ins.rows[0];
      passportRow = ins.rows[0];
    }

    await client.query("COMMIT");
    client.release();
    return res.json({ passport_id: passportRow.passport_id });
  } catch (e) {
    try { await db.query("ROLLBACK"); } catch {}
    console.error("PUT /passport/mine error:", e);
    // If DB throws unique violation on passport_id, surface as 409
    if (e?.code === "23505") {
      return res.status(409).json({ message: "Passport ID already in use." });
    }
    return res.status(500).json({ message: "Failed to save passport." });
  } finally {
    // If we still hold the client for any reason, release it
    try { client.release && client.release(); } catch {}
  }
});

// (optional) DELETE /api/passport/mine
router.delete("/mine", authenticateToken, requireCardholderLike, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    await db.query(`DELETE FROM passports WHERE user_id = $1`, [userId]);
    return res.json({ ok: true });
  } catch (e) {
    console.error("DELETE /passport/mine error:", e);
    return res.status(500).json({ message: "Failed to delete passport." });
  }
});

module.exports = router;
