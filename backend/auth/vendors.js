// backend/auth/routes/vendors.js

const express = require("express");
const router = express.Router();
const db = require("../../db");

// ✅ GET all vendors
router.get("/", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM vendors ORDER BY business_name ASC");
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching vendors:", err);
    res.status(500).json({ error: "Failed to fetch vendors" });
  }
});

// ✅ GET specific vendor by user/vendor ID
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query("SELECT * FROM vendors WHERE id = $1", [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Vendor not found" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error fetching vendor:", err);
    res.status(500).json({ error: "Failed to fetch vendor" });
  }
});

// ✅ CREATE a new vendor
router.post("/", async (req, res) => {
  const { id, business_name, phone, category, approved = false } = req.body;

  if (!id || !business_name || !phone || !category) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const walletId = crypto.randomUUID();

    await db.query(
      `INSERT INTO vendors (id, business_name, phone, category, approved, wallet_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, business_name, phone, category, approved, walletId]
    );

    res.status(201).json({ message: "Vendor created", wallet_id: walletId });

  } catch (err) {
    console.error("❌ Error creating vendor:", err);
    res.status(500).json({ error: "Failed to create vendor" });
  }
});

// ✅ UPDATE vendor
router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const fields = ["business_name", "phone", "category", "approved"];
  const updates = [];
  const values = [];

  fields.forEach(field => {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = $${updates.length + 1}`);
      values.push(req.body[field]);
    }
  });

  if (updates.length === 0) {
    return res.status(400).json({ error: "No fields to update" });
  }

  try {
    await db.query(
      `UPDATE vendors SET ${updates.join(", ")} WHERE id = $${values.length + 1}`,
      [...values, id]
    );
    res.json({ message: "Vendor updated" });
  } catch (err) {
    console.error("❌ Error updating vendor:", err);
    res.status(500).json({ error: "Update failed" });
  }
});

// ✅ DELETE (soft-delete or archive logic optional)
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await db.query("DELETE FROM vendors WHERE id = $1", [id]);
    res.json({ message: "Vendor deleted" });
  } catch (err) {
    console.error("❌ Error deleting vendor:", err);
    res.status(500).json({ error: "Delete failed" });
  }
});

module.exports = router;
