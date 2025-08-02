const express = require("express");
const router = express.Router();
const db = require("../../db");
const { authenticateToken } = require("../middleware/authMiddleware");
const logAdminAction = require("../middleware/log-admin-action");

// ✅ POST /api/user-students — Assign student to parent
router.post("/", authenticateToken, async (req, res) => {
  const { user_id, student_id } = req.body;

  if (!user_id || !student_id) {
    return res.status(400).json({ message: "Missing required fields." });
  }

  try {
    // ✅ Check for existing relationship
    const existing = await db.query(
      `SELECT 1 FROM student_parents WHERE student_id = $1 AND parent_id = $2`,
      [student_id, user_id]
    );

    if (existing.rowCount > 0) {
      return res.status(400).json({
        message: "⚠️ This student is already assigned to this parent."
      });
    }

    // ✅ Insert new relationship
    await db.query(
      `INSERT INTO student_parents (student_id, parent_id) VALUES ($1, $2)`,
      [student_id, user_id]
    );

    await logAdminAction({
      performed_by: req.user.id,
      action: "assign_student",
      target_user_id: user_id,
      type: req.user.type,
      status: "completed",
      completed_at: new Date()
    });

    res.status(201).json({ message: "✅ Student assigned to parent." });

  } catch (err) {
    console.error("❌ Failed to assign student:", err.message);

    await logAdminAction({
      performed_by: req.user.id,
      action: "assign_student",
      target_user_id: user_id,
      type: req.user.type,
      status: "failed",
      error_message: err.message
    });

    res.status(500).json({ message: "🚨 Database error. Could not assign student." });
  }
});

// ✅ DELETE /api/user-students/:studentId — Unlink student from parent
router.delete("/:studentId", authenticateToken, async (req, res) => {
  const { studentId } = req.params;
  const { parent_id } = req.body;

  if (!studentId || !parent_id) {
    return res.status(400).json({ error: "Missing studentId or parent_id" });
  }

  try {
    const result = await db.query(
      `DELETE FROM student_parents WHERE student_id = $1 AND parent_id = $2`,
      [studentId, parent_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Relationship not found" });
    }

    await logAdminAction({
      performed_by: req.user.id,
      action: "unlink_student",
      target_user_id: parent_id,
      type: req.user.type,
      status: "completed",
      completed_at: new Date()
    });

    res.status(200).json({ message: "Student unlinked from parent" });
  } catch (err) {
    console.error("❌ Failed to remove student:", err);

    await logAdminAction({
      performed_by: req.user.id,
      action: "unlink_student",
      target_user_id: parent_id,
      type: req.user.type,
      status: "failed",
      error_message: err.message
    });

    res.status(500).json({ error: "Database error" });
  }
});


// ✅ GET /api/user-students/parents/:studentId — Get parent(s) of student
router.get("/parents/:studentId", authenticateToken, async (req, res) => {
  const { studentId } = req.params;

  if (!studentId) {
    return res.status(400).json({ error: "Missing studentId" });
  }

  try {
    const result = await db.query(`
      SELECT u.id, u.first_name, u.last_name, u.email
      FROM student_parents sp
      JOIN users u ON sp.parent_id = u.id
      WHERE sp.student_id = $1
    `, [studentId]);

    res.json(result.rows);
  } catch (err) {
    console.error("❌ Failed to fetch parent(s):", err);
    res.status(500).json({ error: "Database error" });
  }
});


module.exports = router;
