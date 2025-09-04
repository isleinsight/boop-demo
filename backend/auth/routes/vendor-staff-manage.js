// backend/auth/routes/vendor-staff-manage.js
const express = require("express");
const bcrypt = require("bcrypt");
const pool = require("../../db");
const { authenticateToken } = require("../middleware/authMiddleware");

const router = express.Router();

function isUUID(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v || ""));
}
function requireVendor(req, res, next) {
  const role = String(req.user?.role || "").toLowerCase();
  if (role !== "vendor") return res.status(403).json({ message: "Vendor access required" });
  next();
}
function genTempPw(len = 16) {
  return require("crypto").randomBytes(len).toString("base64url");
}

/**
 * GET /api/vendor/staff
 * List staff for the signed-in vendor.
 */
router.get("/", authenticateToken, requireVendor, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, username, display_name, disabled, deleted_at, created_at, updated_at
         FROM vendor_staff
        WHERE vendor_id = $1
        ORDER BY username ASC`,
      [req.user.id]
    );
    res.json({ staff: rows });
  } catch (e) {
    console.error("[vendor-staff:list] ", e);
    res.status(500).json({ message: "Failed to load staff" });
  }
});

/**
 * POST /api/vendor/staff
 * Body: { username, display_name?, password? }
 * Creates a new staff login under this vendor. If password is omitted, a temp is generated and returned once.
 */
router.post("/", authenticateToken, requireVendor, async (req, res) => {
  try {
    const vendorId = req.user.id;
    const username = String(req.body?.username || "").trim();
    const displayName = (req.body?.display_name || "").trim() || null;
    let password = String(req.body?.password || "").trim();

    if (!username) return res.status(400).json({ message: "username is required" });

    // username must be unique per vendor
    const exists = await pool.query(
      `SELECT 1 FROM vendor_staff WHERE vendor_id = $1 AND username = $2 AND deleted_at IS NULL`,
      [vendorId, username]
    );
    if (exists.rowCount) return res.status(409).json({ message: "username already exists" });

    // Generate a one-time temp password if not provided
    let tempPassword = null;
    if (!password) {
      tempPassword = genTempPw(18);
      password = tempPassword;
    }
    const password_hash = await bcrypt.hash(password, 12);

    const { rows } = await pool.query(
      `INSERT INTO vendor_staff (vendor_id, username, display_name, password_hash, disabled)
       VALUES ($1,$2,$3,$4,false)
       RETURNING id, username, display_name, disabled, created_at`,
      [vendorId, username, displayName, password_hash]
    );

    // Return tempPassword one time if we generated it
    res.status(201).json({
      staff: rows[0],
      tempPassword: tempPassword || undefined
    });
  } catch (e) {
    console.error("[vendor-staff:create] ", e);
    res.status(500).json({ message: "Failed to create staff" });
  }
});

/**
 * PATCH /api/vendor/staff/:id
 * Body: { display_name?, disabled? }
 * Update staff metadata (not password).
 */
router.patch("/:id", authenticateToken, requireVendor, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ message: "Invalid id" });

    const updates = [];
    const values = [];
    if (req.body.display_name !== undefined) {
      updates.push(`display_name = $${updates.length + 1}`);
      values.push(String(req.body.display_name || "").trim() || null);
    }
    if (req.body.disabled !== undefined) {
      updates.push(`disabled = $${updates.length + 1}`);
      values.push(!!req.body.disabled);
    }
    if (!updates.length) return res.status(400).json({ message: "No fields to update" });

    values.push(req.user.id, id);

    // scope by vendor_id to prevent cross-tenant edits
    const { rowCount } = await pool.query(
      `UPDATE vendor_staff
          SET ${updates.join(", ")}, updated_at = NOW()
        WHERE vendor_id = $${values.length - 1}
          AND id = $${values.length}
          AND deleted_at IS NULL`,
      values
    );
    if (!rowCount) return res.status(404).json({ message: "Not found" });

    res.json({ message: "Updated" });
  } catch (e) {
    console.error("[vendor-staff:update] ", e);
    res.status(500).json({ message: "Failed to update staff" });
  }
});

/**
 * POST /api/vendor/staff/:id/reset-password
 * Body: { new_password? }
 * Resets password; if not provided, generates a temp and returns it once.
 */
router.post("/:id/reset-password", authenticateToken, requireVendor, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ message: "Invalid id" });

    let newPw = String(req.body?.new_password || "").trim();
    let tempPassword = null;
    if (!newPw) {
      tempPassword = genTempPw(18);
      newPw = tempPassword;
    }
    const hash = await bcrypt.hash(newPw, 12);

    const { rowCount } = await pool.query(
      `UPDATE vendor_staff
          SET password_hash = $1, updated_at = NOW()
        WHERE vendor_id = $2
          AND id = $3
          AND deleted_at IS NULL`,
      [hash, req.user.id, id]
    );
    if (!rowCount) return res.status(404).json({ message: "Not found" });

    // Optional: revoke active staff sessions for this vendor+staff
    await pool.query(
      `DELETE FROM sessions WHERE email = $1 AND staff_id = $2`,
      [req.user.email, id]
    );

    res.json({
      message: "Password reset",
      tempPassword: tempPassword || undefined
    });
  } catch (e) {
    console.error("[vendor-staff:reset-password] ", e);
    res.status(500).json({ message: "Failed to reset password" });
  }
});

/**
 * POST /api/vendor/staff/:id/revoke
 * Kill active sessions for this staff user only (keeps password).
 */
router.post("/:id/revoke", authenticateToken, requireVendor, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ message: "Invalid id" });

    // Only revoke sessions that belong to this vendor email + staff_id
    const { rowCount } = await pool.query(
      `DELETE FROM sessions WHERE email = $1 AND staff_id = $2`,
      [req.user.email, id]
    );
    res.json({ message: "Sessions revoked", count: rowCount });
  } catch (e) {
    console.error("[vendor-staff:revoke] ", e);
    res.status(500).json({ message: "Failed to revoke sessions" });
  }
});

/**
 * DELETE /api/vendor/staff/:id
 * Soft-delete a staff user and revoke sessions.
 */
router.delete("/:id", authenticateToken, requireVendor, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ message: "Invalid id" });

    const { rowCount } = await pool.query(
      `UPDATE vendor_staff
          SET deleted_at = NOW(), disabled = TRUE
        WHERE vendor_id = $1
          AND id = $2
          AND deleted_at IS NULL`,
      [req.user.id, id]
    );
    if (!rowCount) return res.status(404).json({ message: "Not found" });

    await pool.query(`DELETE FROM sessions WHERE email = $1 AND staff_id = $2`, [req.user.email, id]);

    res.json({ message: "Deleted" });
  } catch (e) {
    console.error("[vendor-staff:delete] ", e);
    res.status(500).json({ message: "Failed to delete staff" });
  }
});

module.exports = router;
