const express = require("express");
const router = express.Router();
const pool = require("../../db");

// ✅ POST /api/students — Create a student entry
router.post("/", async (req, res) => {
  const { user_id, parent_id, school_name, grade_level, expiry_date } = req.body;

  if (!user_id || !school_name || !expiry_date) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO students (user_id, parent_id, school_name, grade_level, expiry_date)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [user_id, parent_id || null, school_name, grade_level || null, expiry_date]
    );

    res.status(201).json({ message: "Student added", student: result.rows[0] });
  } catch (err) {
    console.error("❌ Error adding student:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ GET /api/students — Get all students (optionally filtered)
router.get("/", async (req, res) => {
  const { unassignedOnly, search } = req.query;

  try {
    let baseQuery = `SELECT * FROM students`;
    const params = [];

    if (unassignedOnly === "true") {
      baseQuery += ` WHERE parent_id IS NULL`;
    }

    if (search) {
      const term = `%${search.toLowerCase()}%`;
      baseQuery += params.length === 0 ? " WHERE" : " AND";
      baseQuery += ` LOWER(school_name) LIKE $${params.length + 1}`;
      params.push(term);
    }

    const result = await pool.query(baseQuery, params);
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching students:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ GET /api/students/:id — Get one student
router.get("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(`SELECT * FROM students WHERE user_id = $1`, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Student not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error getting student:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ PATCH /api/students/:id — Update student info
router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const fields = ["parent_id", "school_name", "grade_level", "expiry_date"];
  const updates = [];
  const values = [];

  fields.forEach((field) => {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = $${updates.length + 1}`);
      values.push(req.body[field]);
    }
  });

  if (updates.length === 0) {
    return res.status(400).json({ message: "No fields to update" });
  }

  try {
    await pool.query(
      `UPDATE students SET ${updates.join(", ")} WHERE user_id = $${values.length + 1}`,
      [...values, id]
    );

    res.json({ message: "Student updated" });
  } catch (err) {
    console.error("❌ Error updating student:", err);
    res.status(500).json({ message: "Update failed" });
  }
});

// ✅ DELETE /api/students/:id — Remove student entry
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query(`DELETE FROM students WHERE user_id = $1`, [id]);
    res.json({ message: "Student deleted" });
  } catch (err) {
    console.error("❌ Error deleting student:", err);
    res.status(500).json({ message: "Delete failed" });
  }
});

module.exports = router;
