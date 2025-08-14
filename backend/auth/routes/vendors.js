const express = require("express");
const router = express.Router();
const db = require("../../db");
const { authenticateToken } = require("../middleware/authMiddleware");

// --- helpers ---------------------------------------------------------------
function requireAdmin(req, res, next) {
  const role = (req.user?.role || "").toLowerCase();
  const type = (req.user?.type || "").toLowerCase();
  // Allow admin; optionally narrow by type if you want:
  if (role !== "admin") {
    return res.status(403).json({ error: "Admin access required." });
  }
  next();
}

async function audit({ action, status = "completed", adminId, targetUserId }) {
  try {
    await db.query(
      `INSERT INTO admin_actions (action, status, performed_by, target_user_id, requested_at, completed_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())`,
      [action, status, adminId || null, targetUserId || null]
    );
  } catch (e) {
    // don't block main flow on audit failure, but log it
    console.warn("⚠️ admin_actions insert failed:", e.message || e);
  }
}

// ---------------------------------------------------------------------------
// POST: Block direct vendor creation
router.post("/", (req, res) => {
  res.status(405).json({ error: "Use /api/users to create vendors." });
});

// GET: Only active, non-deleted vendors
router.get("/", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT v.*, u.email, u.first_name, u.last_name
         FROM vendors v
         JOIN users u ON v.user_id = u.id           -- FIXED: join on user_id
        WHERE u.deleted_at IS NULL
          AND u.status = 'active'
          AND u.role = 'vendor'`                    // ensure vendors only
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Failed to fetch vendors:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// PATCH: Update vendor details
router.patch("/:id", authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params; // this is the vendor's user_id
  const adminId = req.user?.id;

  // Normalize inputs (allow null/undefined to mean "no change")
  const business_name = typeof req.body.business_name === "string" ? req.body.business_name.trim() : null;
  const category      = typeof req.body.category === "string"      ? req.body.category.trim()      : null;
  const phone         = typeof req.body.phone === "string"         ? req.body.phone.trim()         : null;

  try {
    const result = await db.query(
      `UPDATE vendors
          SET business_name = COALESCE($1, business_name),
              category      = COALESCE($2, category),
              phone         = COALESCE($3, phone)
        WHERE user_id = $4
      RETURNING *`,
      [business_name, category, phone, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Vendor not found" });
    }

    await audit({ action: "update_vendor", adminId, targetUserId: id });

    res.json({ message: "Vendor updated", vendor: result.rows[0] });
  } catch (err) {
    console.error("❌ Vendor update failed:", err);
    res.status(500).json({ error: "Failed to update vendor" });
  }
});

// DELETE: Soft-delete vendor (user row) + optional flag in vendors
router.delete("/:id", authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params; // this is the vendor's user_id
  const adminId = req.user?.id;

  const client = await db.pool?.connect ? db.pool.connect() : db.connect?.();
  try {
    await client.query("BEGIN");

    // Soft delete user
    const userRes = await client.query(
      `UPDATE users
          SET deleted_at = NOW(),
              status = 'suspended'
        WHERE id = $1
          AND role = 'vendor'
      RETURNING id`,
      [id]
    );

    if (!userRes.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Vendor not found or already deleted" });
    }

    // OPTIONAL: if vendors table has an active/enabled flag, flip it.
    // We'll try an update, ignore error if column doesn't exist.
    try {
      await client.query(
        `UPDATE vendors SET active = FALSE WHERE user_id = $1`,
        [id]
      );
    } catch (_) {
      // column may not exist—ignore
    }

    await client.query("COMMIT");

    await audit({ action: "delete_vendor", adminId, targetUserId: id });

    res.json({ message: "Vendor soft-deleted", vendor_id: userRes.rows[0].id });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error("❌ Failed to soft-delete vendor:", err);
    res.status(500).json({ error: "Server error" });
  } finally {
    if (client?.release) client.release();
  }
});

module.exports = router;
