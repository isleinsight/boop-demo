const express = require("express");
const router = express.Router();
const pool = require("../../db");
const bcrypt = require("bcrypt");

// ✅ POST /api/users — Create a new user
router.post("/", async (req, res) => {
  const {
    email,
    password,
    first_name,
    last_name,
    role,
    on_assistance,
    vendor,
  } = req.body;

  try {
    console.log("🔐 Creating user:", {
      email, first_name, last_name, role, on_assistance, vendor
    });

    const hashedPassword = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users (
        email, password_hash, first_name, last_name,
        role, on_assistance, vendor_info
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        email,
        hashedPassword,
        first_name,
        last_name,
        role,
        on_assistance,
        vendor ? JSON.stringify(vendor) : null,
      ]
    );

    res.status(201).json({ message: "User created", user: result.rows[0] });
  } catch (err) {
    console.error("❌ Error creating user:", {
      message: err.message,
      stack: err.stack,
      detail: err.detail,
    });
    res.status(500).json({ message: "Failed to create user" });
  }
});

// ✅ GET /api/users — supports parentId, role search, and default fetch
router.get("/", async (req, res) => {
  const { parentId, role, search, page = 1 } = req.query;

  try {
    if (parentId) {
      const result = await pool.query("SELECT * FROM users WHERE parent_id = $1", [parentId]);
      return res.json(result.rows);
    }

    if (role === "student" && search !== undefined) {
      const perPage = 5;
      const offset = (parseInt(page) - 1) * perPage;
      const term = `%${search.toLowerCase()}%`;
      const result = await pool.query(
        `SELECT * FROM users WHERE role = 'student' AND (
          LOWER(first_name) LIKE $1 OR LOWER(last_name) LIKE $1 OR LOWER(email) LIKE $1
        ) ORDER BY first_name ASC LIMIT $2 OFFSET $3`,
        [term, perPage, offset]
      );
      return res.json(result.rows);
    }

    // Default: return all users
    const result = await pool.query("SELECT * FROM users ORDER BY first_name ASC");
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error in GET /api/users", err);
    res.status(500).json({ message: "Failed to process request" });
  }
});

// ✅ PATCH /api/users/:id — update user
router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const fields = ["first_name", "last_name", "email", "role", "status", "parent_id"];
  const updates = [];
  const values = [];

  fields.forEach((field) => {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = $${updates.length + 1}`);
      values.push(req.body[field]);
    }
  });

  if (updates.length === 0) {
    return res.status(400).json({ message: "No fields provided" });
  }

  try {
    await pool.query(
      `UPDATE users SET ${updates.join(", ")} WHERE id = $${values.length + 1}`,
      [...values, id]
    );
    res.json({ message: "User updated" });
  } catch (err) {
    console.error("❌ Error updating user:", err);
    res.status(500).json({ message: "Update failed" });
  }
});

// ✅ DELETE /api/users/:id — delete user
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query("DELETE FROM users WHERE id = $1", [id]);
    res.json({ message: "User deleted" });
  } catch (err) {
    console.error("❌ Error deleting user:", err);
    res.status(500).json({ message: "Delete failed" });
  }
});

// ✅ GET /api/users/:id — fetch user by ID (MUST be below other GETs)
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error fetching user:", err);
    res.status(500).json({ message: "Failed to fetch user" });
  }
});

// ✅ POST /api/users/:id/signout — force signout stub
router.post("/:id/signout", async (req, res) => {
  // TODO: Invalidate token/session here
  res.json({ message: "Force sign-out not implemented yet" });
});

module.exports = router;
