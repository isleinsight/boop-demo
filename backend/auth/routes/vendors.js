const express = require("express");
const router = express.Router();
const db = require("../../db");
const { authenticateToken } = require("../middleware/authMiddleware");

// Block direct vendor creation
router.post("/", (req, res) => {
  res.status(405).json({ error: "Use /api/users to create vendors." });
});

// GET: Only active, non-deleted vendors
router.get("/", authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT v.*, u.email, u.first_name, u.last_name
       FROM vendors v
       JOIN users u ON v.id = u.id
       WHERE u.deleted_at IS NULL AND u.status = 'active'`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Failed to fetch vendors:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// PATCH: Update vendor details
router.patch("/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { business_name, category, phone } = req.body;
  const adminId = req.user?.id;

  try {
    const result = await db.query(
      `UPDATE vendors
       SET business_name = COALESCE($1, business_name),
           category = COALESCE($2, category),
           phone = COALESCE($3, phone)
       WHERE id = $4
       RETURNING *`,
      [business_name, category, phone, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Vendor not found" });
    }

// ✅ Log admin action
await db.query(
  `INSERT INTO admin_actions (action, status, performed_by, target_id, requested_at, completed_at)
   VALUES ($1, $2, $3, $4, NOW(), NOW())`,
  ['update_vendor', 'completed', adminId, id]
);

    res.json({ message: "Vendor updated", vendor: result.rows[0] });

  } catch (err) {
    console.error("❌ Vendor update failed:", err);
    res.status(500).json({ error: "Failed to update vendor" });
  }
});

// DELETE: Soft-delete vendor (set deleted_at and suspend status)
router.delete("/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const adminId = req.user?.id;

  try {
    const result = await db.query(
      `UPDATE users
       SET deleted_at = NOW(),
           status = 'suspended'
       WHERE id = $1 AND role = 'vendor'
       RETURNING id`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Vendor not found or already deleted" });
    }

// ✅ Log admin action
await db.query(
  `INSERT INTO admin_actions (action, status, performed_by, target_id, requested_at, completed_at)
   VALUES ($1, $2, $3, $4, NOW(), NOW())`,
  ['update_vendor', 'completed', adminId, id]
);

    res.json({ message: "Vendor soft-deleted", vendor_id: result.rows[0].id });

  } catch (err) {
    console.error("❌ Failed to soft-delete vendor:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
