// File: backend/auth/routes/passport.js
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
/** Utilities */
// ─────────────────────────────────────────────────────────────────────────────
function validatePassportId(raw) {
  const v = String(raw || "").trim();
  return /^[A-Za-z0-9\- ]{4,64}$/.test(v) ? v : null;
}

async function upsertPassportForUser(client, userId, passportId) {
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

function generatePassportId() {
  // Human-friendly unique ID; matches our validation
  const ts = Date.now().toString(36).toUpperCase();
  const rnd = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `P-${ts}-${rnd}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// NOTE: define /mine routes BEFORE /:userId to avoid route conflicts
// ─────────────────────────────────────────────────────────────────────────────

// Self-service (cardholder-like): GET /api/passport/mine -> { passport_id } | {}
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

// Self-service: PUT /api/passport/mine { passport_id }
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

// Self-service: DELETE /api/passport/mine
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

// ─────────────────────────────────────────────────────────────────────────────
// Admin endpoints (requireAdminLike)
// ─────────────────────────────────────────────────────────────────────────────

// Admin: POST /api/passport/:userId/regenerate -> { passportId }
router.post("/:userId/regenerate", authenticateToken, requireAdminLike, async (req, res) => {
  const client = await db.connect();
  try {
    const { userId } = req.params;
    if (!userId) {
      client.release();
      return res.status(400).json({ message: "userId required" });
    }

    await client.query("BEGIN");

    // generate a unique passport id (few attempts)
    let newId = null;
    for (let i = 0; i < 6; i++) {
      const candidate = generatePassportId();
      const exists = await client.query(
        `SELECT 1 FROM passports WHERE LOWER(passport_id) = LOWER($1) LIMIT 1`,
        [candidate]
      );
      if (!exists.rowCount) {
        newId = candidate;
        break;
      }
    }
    if (!newId) {
      await client.query("ROLLBACK");
      client.release();
      return res.status(500).json({ message: "Could not generate unique ID" });
    }

    const saved = await upsertPassportForUser(client, userId, newId);

    await client.query("COMMIT");
    client.release();
    return res.json({ passportId: saved });
  } catch (e) {
    try { await db.query("ROLLBACK"); } catch {}
    console.error("POST /api/passport/:userId/regenerate error:", e);
    return res.status(500).json({ message: "Failed to regenerate passport." });
  } finally {
    try { client?.release && client.release(); } catch {}
  }
});

// Admin: GET /api/passport/:userId -> { passportId: string|null }
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

// Admin: PUT /api/passport/:userId { passportId | passport_id }
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

module.exports = router;
