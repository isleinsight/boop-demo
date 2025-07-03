const express = require("express");
const router = express.Router();
const pool = require("../../db");
const bcrypt = require("bcrypt");

// ✅ POST /api/users — Create a new user (and vendor if applicable)
router.post("/", async (req, res) => {
  const {
    email,
    password,
    first_name,
    last_name,
    role,
    on_assistance,
    vendor, // only sent for vendor users
  } = req.body;

  try {
    console.log("🧪 Creating user:", { email, role, vendor });

    const hashedPassword = await bcrypt.hash(password, 12);

    // Create the user
    const userResult = await pool.query(
      `INSERT INTO users (
        email, password, first_name, last_name, role, on_assistance
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id`,
      [email, hashedPassword, first_name, last_name, role, on_assistance]
    );

    const userId = userResult.rows[0].id;

    // If user is a vendor, insert vendor profile
    if (role === "vendor" && vendor) {
      const { business_name, category, phone, address, approved } = vendor;

      await pool.query(
        `INSERT INTO vendors (
          user_id, business_name, category, phone, address, approved
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, business_name, category, phone, address, approved || false]
      );
    }

    res.status(201).json({ message: "User created", user_id: userId });
  } catch (err) {
    console.error("❌ Error creating user:", {
      message: err.message,
      stack: err.stack,
    });
    res.status(500).json({ message: "Failed to create user" });
  }
});

// ✅ GET /api/users — supports parentId, role filtering, and search
router.get("/", async (req, res) => {
  const { parentId, role, search, page = 1 } = req.query;

  try {
    if (parentId) {
      const result = await pool.query(
        "SELECT * FROM users WHERE parent_id = $1",
        [parentId]
      );
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

    // Default: fetch all users
    const result = await pool.query(
      "SELECT * FROM users ORDER BY first_name ASC"
    );
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

// ✅ GET /api/users/:id — get user by ID
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

// ✅ POST /api/users/:id/signout — force signout (stub)
router.post("/:id/signout", async (req, res) => {
  // TODO: Invalidate user sessions here
  res.json({ message: "Force sign-out not implemented yet" });
});

module.exports = router;
