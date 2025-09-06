/**
 * File: backend/auth/routes/passport.js
 * Purpose: Manage user passport IDs and expose Tap Link data to the Admin UI.
 *
 * Endpoints
 * ├─ Admin (dashboard)
 * │  GET /api/passport/:userId          → { passportId|null }
 * │  PUT /api/passport/:userId          → { passportId }  (set/update)
 * ├─ Cardholder-like (self-service)
 * │  GET    /api/passport/mine          → { passport_id|null }
 * │  PUT    /api/passport/mine          → { passport_id }
 * │  DELETE /api/passport/mine          → { ok:true }
 *
 * Notes
 * - Admin auth gate mirrors the frontend check (role === "admin" and type in [super_admin|admin|support]).
 * - DB table: passports(user_id, passport_id, created_at, updated_at, id UUID).
 * - Returns camelCase for admin endpoints to match the dashboard; snake_case for /mine to preserve existing clients.
 */

const express = require("express");
const router = express.Router();
const db = require("../../db");
const { authenticateToken } = require("../middleware/authMiddleware");

// ─────────────────────────────────────────────────────────────────────────────
// Guards
// ─────────────────────────────────────────────────────────────────────────────
function requireAdminLike(req, res, next) {
  const role = String(req.user?.role || "").toLowerCase();
  const type = String(req.user?.type || "").toLowerCase();
  const allowed = new Set(["super_admin", "admin", "support"]);
  if (role === "admin" && allowed.has(type)) return next();
  return res.status(403).json({ message: "Admin access required." });
}

function requireCardholderLike(req, res, next) {
  const role = String(req.user?.role || "").toLowerCase();
  if (["cardholder", "student", "senior"].includes(role)) return next();
  return res.status(403).json({ message: "Cardholder access required." });
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────
function validatePassportId(raw) {
  const v = String(raw || "").trim();
  if (!/^[A-Za-z0-9\- ]{4,64}$/.test(v)) return null;
  return v;
}

async function upsertPassportForUser(client, userId, passportId) {
  // try update; if none, insert
  const upd = await client.query(
    `UPDATE passports
       SET passport_id = $1, updated_at = NOW()
     WHERE user_id = $2
     RETURNING passport_id`,
    [passportId, userId]
  );

  if (upd.rowCount > 0) return upd.rows[0].passport_id;

  const ins = await client.query(
    `INSERT INTO passports (id, user_id, passport_id, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, NOW(), NOW())
     RETURNING passport_id`,
    [userId, passportId]
  );
  return ins.rows[0].passport_id;
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin: read by user id (camelCase for UI convenience)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/:userId", authenticateToken, requireAdminLike, async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ message: "userId required" });

    const q = `SELECT passport_id FROM passports WHERE user_id = $1 LIMIT 1`;
    const { rows } = await db.query(q, [userId]);
    const passportId = rows[0]?.passport_id || null;
    return res.json({ passportId });
  } catch (e) {
    console.error("GET /api/passport/:userId error:", e);
    return res.status(500).json({ message: "Failed to load passport." });
  }
});

// Admin: set/update by user id
router.put("/:userId", authenticateToken, requireAdminLike, async (req, res) => {
  const client = await db.connect();
  try {
    const { userId } = req.params;
    const raw = req.body?.passportId ?? req.body?.passport_id;
    const passportId = validatePassportId(raw);
    if (!passportId) {
      client.release();
      return res.status(400).json({ message: "Invalid passport format." });
    }

    await client.query("BEGIN");

    // uniqueness guard
    const inUse = await client.query(
      `SELECT 1 FROM passports WHERE LOWER(passport_id) = LOWER($1) AND user_id <> $2 LIMIT 1`,
      [passportId, userId]
    );
    if (inUse.rowCount) {
      await client.query("ROLLBACK");
      client.release();
      return res.status(409).json({ message: "Passport ID already in use." });
    }

    const saved = await upsertPassportForUser(client, userId, passportId);

    await client.query("COMMIT");
    client.release();
    return res.json({ passportId: saved });
  } catch (e) {
    try { await db.query("ROLLBACK"); } catch {}
    console.error("PUT /api/passport/:userId error:", e);
    if (e?.code === "23505") {
      return res.status(409).json({ message: "Passport ID already in use." });
    }
    return res.status(500).json({ message: "Failed to save passport." });
  } finally {
    try { client?.release && client.release(); } catch {}
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Self-service (cardholder-like): /mine (snake_case preserved)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/mine", authenticateToken, requireCardholderLike, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    const { rows } = await db.query(
      `SELECT passport_id FROM passports WHERE user_id = $1 LIMIT 1`,
      [userId]
    );
    return res.json(rows[0] || {});
  } catch (e) {
    console.error("GET /api/passport/mine error:", e);
    return res.status(500).json({ message: "Failed to load passport." });
  }
});

router.put("/mine", authenticateToken, requireCardholderLike, async (req, res) => {
  const client = await db.connect();
  try {
    const userId = req.user?.userId || req.user?.id;
    const passportId = validatePassportId(req.body?.passport_id);
    if (!passportId) {
      client.release();
      return res.status(400).json({ message: "Invalid passport format." });
    }

    await client.query("BEGIN");

    const inUse = await client.query(
      `SELECT 1 FROM passports WHERE LOWER(passport_id) = LOWER($1) AND user_id <> $2 LIMIT 1`,
      [passportId, userId]
    );
    if (inUse.rowCount) {
      await client.query("ROLLBACK");
      client.release();
      return res.status(409).json({ message: "Passport ID already in use." });
    }

    const saved = await upsertPassportForUser(client, userId, passportId);

    await client.query("COMMIT");
    client.release();
    return res.json({ passport_id: saved });
  } catch (e) {
    try { await db.query("ROLLBACK"); } catch {}
    console.error("PUT /api/passport/mine error:", e);
    if (e?.code === "23505") {
      return res.status(409).json({ message: "Passport ID already in use." });
    }
    return res.status(500).json({ message: "Failed to save passport." });
  } finally {
    try { client?.release && client.release(); } catch {}
  }
});

router.delete("/mine", authenticateToken, requireCardholderLike, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    await db.query(`DELETE FROM passports WHERE user_id = $1`, [userId]);
    return res.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/passport/mine error:", e);
    return res.status(500).json({ message: "Failed to delete passport." });
  }
});

module.exports = router;
