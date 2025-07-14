const express = require("express");
const router = express.Router();
const db = require("../../db");

// Block direct vendor creation
router.post("/", (req, res) => {
  res.status(405).json({ error: "Use /api/users to create vendors." });
});

// GET: Only active, non-deleted vendors
router.get("/", async (req, res) => {
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
router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const { business_name, category, phone } = req.body;

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

    res.json({ message: "Vendor updated", vendor: result.rows[0] });

  } catch (err) {
    console.error("❌ Vendor update failed:", err);
    res.status(500).json({ error: "Failed to update vendor" });
  }
});

// DELETE: Soft-delete vendor (set deleted_at and suspend status)
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

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

    res.json({ message: "Vendor soft-deleted", vendor_id: result.rows[0].id });

  } catch (err) {
    console.error("❌ Failed to soft-delete vendor:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
