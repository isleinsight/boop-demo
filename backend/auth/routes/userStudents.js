const express = require("express");
const router = express.Router();
const db = require("../../db");

// ✅ POST /api/user-students — Assign student to parent
router.post("/", async (req, res) => {
  const { user_id, student_id } = req.body;

  if (!user_id || !student_id) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    await db.query(
      `INSERT INTO student_parents (student_id, parent_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [student_id, user_id]
    );

    res.status(201).json({ message: "Student assigned to parent" });
  } catch (err) {
    console.error("❌ Failed to assign student:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// ✅ DELETE /api/user-students/:studentId — Unlink student from parent
router.delete("/:studentId", async (req, res) => {
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

    res.status(200).json({ message: "Student unlinked from parent" });
  } catch (err) {
    console.error("❌ Failed to remove student:", err);
    res.status(500).json({ error: "Database error" });
  }
});

module.exports = router;
