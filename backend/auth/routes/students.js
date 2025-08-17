// ./auth/routes/students.js
const express = require("express");
const router = express.Router();
const pool = require("../../db");

const { authenticateToken } = require("../middleware/authMiddleware");
const logAdminAction = require("../middleware/log-admin-action");

/*
-- Run these once if you don't already have storage for limits/categories:

CREATE TABLE IF NOT EXISTS student_limits (
  student_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  monthly_limit_cents INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS student_categories (
  student_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  allow JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
*/

function isAdmin(req) {
  return (req.user?.role || "").toLowerCase() === "admin";
}

// Check if the requester can act on this student (admin, linked parent, or the student)
async function canActOnStudent(req, studentId) {
  const userId = req.user?.userId ?? req.user?.id;
  const role = (req.user?.role || "").toLowerCase();

  if (!userId) return false;
  if (isAdmin(req)) return true;
  if (userId === studentId) return true; // the student themselves

  // linked parent?
  if (role === "parent") {
    const link = await pool.query(
      `SELECT 1 FROM student_parents WHERE student_id = $1 AND parent_id = $2 LIMIT 1`,
      [studentId, userId]
    );
    return link.rowCount > 0;
  }

  return false;
}

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
  const { id: user_id } = req.params;

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

  values.push(user_id);

  const updateQuery = `
    UPDATE students
    SET ${fieldsToUpdate.join(", ")}, updated_at = NOW()
    WHERE user_id = $${values.length}
    RETURNING *
  `;

  try {
    const result = await pool.query(updateQuery, values);

    if (result.rowCount === 0) {
      const insertRes = await pool.query(
        `INSERT INTO students (user_id, school_name, grade_level, expiry_date)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [user_id, req.body.school_name, req.body.grade_level || null, req.body.expiry_date]
      );

      return res
        .status(201)
        .json({ message: "Student created", student: insertRes.rows[0] });
    }

    res.json({ message: "Student updated", student: result.rows[0] });
  } catch (err) {
    console.error("❌ Error in PATCH /api/students/:id:", err);
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
      status: "completed",
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
      error_message: err.message,
    });

    res.status(500).json({ message: "Linking failed" });
  }
});

// ✅ GET /api/students/:id/parents — List parents for student
router.get("/:id/parents", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `
      SELECT u.id, u.first_name, u.last_name, u.email
      FROM student_parents sp
      JOIN users u ON sp.parent_id = u.id
      WHERE sp.student_id = $1
    `,
      [id]
    );

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
    const result = await pool.query(
      `
      SELECT s.*, u.first_name, u.last_name, u.email
      FROM student_parents sp
      JOIN students s ON sp.student_id = s.user_id
      JOIN users u ON s.user_id = u.id
      WHERE sp.parent_id = $1
    `,
      [parentId]
    );

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


// =====================================================================
// 📦 LIMITS
// =====================================================================

// GET /api/students/:id/limits  -> { monthly_limit: number|null }
router.get("/:id/limits", authenticateToken, async (req, res) => {
  const { id: studentId } = req.params;

  try {
    if (!(await canActOnStudent(req, studentId))) {
      return res.status(403).json({ message: "Not authorized." });
    }

    const r = await pool.query(
      `SELECT monthly_limit_cents FROM student_limits WHERE student_id = $1`,
      [studentId]
    );

    if (!r.rowCount) {
      return res.json({ monthly_limit: null });
    }

    const cents = Number(r.rows[0].monthly_limit_cents || 0);
    return res.json({ monthly_limit: (cents / 100) });
  } catch (err) {
    console.error("❌ GET limits error:", err);
    res.status(500).json({ message: "Failed to load limit." });
  }
});

// PUT /api/students/:id/limits  Body: { monthly_limit: number }
router.put("/:id/limits", authenticateToken, async (req, res) => {
  const { id: studentId } = req.params;
  const amt = Number(req.body?.monthly_limit);

  if (!Number.isFinite(amt) || amt < 0) {
    return res.status(400).json({ message: "Invalid monthly_limit." });
  }

  try {
    if (!(await canActOnStudent(req, studentId))) {
      return res.status(403).json({ message: "Not authorized." });
    }

    const cents = Math.round(amt * 100);

    const up = await pool.query(
      `INSERT INTO student_limits (student_id, monthly_limit_cents, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (student_id)
       DO UPDATE SET monthly_limit_cents = EXCLUDED.monthly_limit_cents, updated_at = NOW()
       RETURNING monthly_limit_cents`,
      [studentId, cents]
    );

    return res.json({ monthly_limit: (Number(up.rows[0].monthly_limit_cents) / 100) });
  } catch (err) {
    console.error("❌ PUT limits error:", err);
    res.status(500).json({ message: "Failed to save limit." });
  }
});

// DELETE /api/students/:id/limits
router.delete("/:id/limits", authenticateToken, async (req, res) => {
  const { id: studentId } = req.params;

  try {
    if (!(await canActOnStudent(req, studentId))) {
      return res.status(403).json({ message: "Not authorized." });
    }

    await pool.query(`DELETE FROM student_limits WHERE student_id = $1`, [studentId]);
    return res.json({ message: "Limit cleared." });
  } catch (err) {
    console.error("❌ DELETE limits error:", err);
    res.status(500).json({ message: "Failed to clear limit." });
  }
});


// =====================================================================
// 🧩 CATEGORIES (allow-list)
// =====================================================================

// sensible default if nothing saved yet
const DEFAULT_ALLOW = {
  food: true,
  fastfood: false,
  electronics: false,
  entertainment: true,
  other: true,
};

// GET /api/students/:id/categories -> { allow: {...} }
router.get("/:id/categories", authenticateToken, async (req, res) => {
  const { id: studentId } = req.params;

  try {
    if (!(await canActOnStudent(req, studentId))) {
      return res.status(403).json({ message: "Not authorized." });
    }

    const r = await pool.query(
      `SELECT allow FROM student_categories WHERE student_id = $1`,
      [studentId]
    );

    if (!r.rowCount) {
      return res.json({ allow: DEFAULT_ALLOW });
    }

    const allow = r.rows[0].allow || {};
    return res.json({ allow: {
      ...DEFAULT_ALLOW,
      ...allow,
    }});
  } catch (err) {
    console.error("❌ GET categories error:", err);
    res.status(500).json({ message: "Failed to load categories." });
  }
});

// PUT /api/students/:id/categories  Body: { allow: { ... } }
router.put("/:id/categories", authenticateToken, async (req, res) => {
  const { id: studentId } = req.params;
  const incoming = req.body?.allow || {};

  // coerce booleans, merge with defaults
  const normalized = {
    food: !!incoming.food,
    fastfood: !!incoming.fastfood,
    electronics: !!incoming.electronics,
    entertainment: !!incoming.entertainment,
    other: !!incoming.other,
  };

  try {
    if (!(await canActOnStudent(req, studentId))) {
      return res.status(403).json({ message: "Not authorized." });
    }

    const up = await pool.query(
      `INSERT INTO student_categories (student_id, allow, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (student_id)
       DO UPDATE SET allow = EXCLUDED.allow, updated_at = NOW()
       RETURNING allow`,
      [studentId, JSON.stringify(normalized)]
    );

    return res.json({ allow: up.rows[0].allow });
  } catch (err) {
    console.error("❌ PUT categories error:", err);
    res.status(500).json({ message: "Failed to save categories." });
  }
});

// DELETE /api/students/:id/categories -> reset to defaults (by deleting row)
router.delete("/:id/categories", authenticateToken, async (req, res) => {
  const { id: studentId } = req.params;

  try {
    if (!(await canActOnStudent(req, studentId))) {
      return res.status(403).json({ message: "Not authorized." });
    }

    await pool.query(`DELETE FROM student_categories WHERE student_id = $1`, [studentId]);
    return res.json({ message: "Categories reset to defaults.", allow: DEFAULT_ALLOW });
  } catch (err) {
    console.error("❌ DELETE categories error:", err);
    res.status(500).json({ message: "Failed to reset categories." });
  }
});

module.exports = router;
