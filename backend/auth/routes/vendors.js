const express = require("express");
const router = express.Router();
const db = require("../../db");

// ❌ Disabled: vendor creation must go through /api/users
router.post("/", (req, res) => {
  res.status(405).json({ error: "Use /api/users to create vendors." });
});

// ✅ GET: All vendors with associated user profile info
router.get("/", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT v.*, u.email, u.first_name, u.last_name
       FROM vendors v
       JOIN users u ON v.id = u.id`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Failed to fetch vendors:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ PATCH: Update vendor profile (without approved)
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

// ⚠️ DEV ONLY: Delete vendor and associated user
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    await db.query("DELETE FROM vendors WHERE id = $1", [id]);
    await db.query("DELETE FROM users WHERE id = $1", [id]); // Optional: if you're OK removing the user too

    res.json({ message: "Vendor deleted" });
  } catch (err) {
    console.error("❌ Failed to delete vendor:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
