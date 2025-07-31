const express = require("express");
const router = express.Router();
const pool = require("../../db");

const { authenticateToken } = require("../middleware/authMiddleware");
const logAdminAction = require("../middleware/log-admin-action");

// ✅ POST /api/students — Create a student entry
router.post("/", async (req, res) => {
  const { user_id, school_name, grade_level, expiry_date } = req.body;

  if (!user_id || !school_name || !expiry_date) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO students (user_id, school_name, grade_level, expiry_date)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [user_id, school_name, grade_level || null, expiry_date]
    );

    res.status(201).json({ message: "Student added", student: result.rows[0] });
  } catch (err) {
    console.error("❌ Error adding student:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ GET /api/students — Optionally filter/search
router.get("/", async (req, res) => {
  const { search } = req.query;

  try {
    let baseQuery = `SELECT * FROM students`;
    const params = [];

    if (search) {
      const term = `%${search.toLowerCase()}%`;
      baseQuery += ` WHERE LOWER(school_name) LIKE $1`;
      params.push(term);
    }

    const result = await pool.query(baseQuery, params);
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching students:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ GET /api/students/:id — Get one student by user_id
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

// ✅ PATCH /api/students/:id — Update or insert by user_id
router.patch("/:id", async (req, res) => {
  const { id } = req.params;

  const fieldsToUpdate = [];
  const values = [];

  if (req.body.school_name !== undefined) {
    values.push(req.body.school_name);
    fieldsToUpdate.push(`school_name = $${values.length}`);
  }

  if (req.body.grade_level !== undefined) {
    values.push(req.body.grade_level);
    fieldsToUpdate.push(`grade_level = $${values.length}`);
  }

  if (req.body.expiry_date !== undefined) {
    values.push(req.body.expiry_date);
    fieldsToUpdate.push(`expiry_date = $${values.length}`);
  }

  if (fieldsToUpdate.length === 0) {
    return res.status(400).json({ message: "No fields to update" });
  }

  values.push(id); // This is user_id

  const updateQuery = `
    UPDATE students
    SET ${fieldsToUpdate.join(", ")}
    WHERE user_id = $${values.length}
    RETURNING *
  `;

  try {
    const result = await pool.query(updateQuery, values);

    if (result.rowCount === 0) {
      // Student not found, insert instead
      const insertRes = await pool.query(
        `INSERT INTO students (user_id, school_name, grade_level, expiry_date)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [id, req.body.school_name, req.body.grade_level || null, req.body.expiry_date]
      );

      return res.status(201).json({ message: "Student created", student: insertRes.rows[0] });
    }

    res.json({ message: "Student updated", student: result.rows[0] });
  } catch (err) {
    console.error("❌ Error upserting student:", err);
    res.status(500).json({ message: "Update failed" });
  }
});

// ✅ DELETE /api/students/:id — Delete by user_id
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

// =========================
// 👨‍👩‍👧 PARENT RELATIONSHIP ROUTES
// =========================

// ✅ POST /api/students/:id/parents — Link parent to student
router.post("/:id/parents", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { parent_id } = req.body;

  if (!parent_id) {
    return res.status(400).json({ message: "Missing parent_id" });
  }

  try {
    await pool.query(
      `INSERT INTO student_parents (student_id, parent_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [id, parent_id]
    );

    await logAdminAction({
      performed_by: req.user.id,
      action: "link_parent",
      target_user_id: parent_id,
      type: req.user.type,
      status: "completed"
    });

    res.json({ message: "Parent linked to student" });
  } catch (err) {
    console.error("❌ Error linking parent:", err);

    await logAdminAction({
      performed_by: req.user?.id || null,
      action: "link_parent",
      target_user_id: parent_id,
      type: req.user?.type || "unknown",
      status: "failed",
      error_message: err.message
    });

    res.status(500).json({ message: "Linking failed" });
  }
});

// ✅ GET /api/students/:id/parents — List parents for student
router.get("/:id/parents", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(`
      SELECT u.id, u.first_name, u.last_name, u.email
      FROM student_parents sp
      JOIN users u ON sp.parent_id = u.id
      WHERE sp.student_id = $1
    `, [id]);

    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching parents:", err);
    res.status(500).json({ message: "Fetch failed" });
  }
});

// ✅ GET /api/students/for-parent/:parentId — Students linked to parent
router.get("/for-parent/:parentId", async (req, res) => {
  const { parentId } = req.params;

  try {
    const result = await pool.query(`
      SELECT s.*, u.first_name, u.last_name, u.email
      FROM student_parents sp
      JOIN students s ON sp.student_id = s.user_id
      JOIN users u ON s.user_id = u.id
      WHERE sp.parent_id = $1
    `, [parentId]);

    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching assigned students:", err);
    res.status(500).json({ message: "Fetch failed" });
  }
});

// ✅ DELETE /api/students/:id/parents/:parentId — Unlink parent from student
router.delete("/:id/parents/:parentId", async (req, res) => {
  const { id, parentId } = req.params;

  try {
    await pool.query(
      `DELETE FROM student_parents WHERE student_id = $1 AND parent_id = $2`,
      [id, parentId]
    );

    res.json({ message: "Parent unlinked from student" });
  } catch (err) {
    console.error("❌ Error unlinking parent:", err);
    res.status(500).json({ message: "Unlink failed" });
  }
});

module.exports = router;
