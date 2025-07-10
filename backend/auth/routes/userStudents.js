const express = require("express");
const router = express.Router();
const db = require("../../db");

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

module.exports = router;
