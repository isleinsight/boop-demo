const express = require("express");
const router = express.Router();
const pool = require("../../db"); // path to db.js

router.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM users ORDER BY first_name ASC");
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching users:", err);
    res.status(500).json({ message: "Failed to fetch users" });
  }
});

module.exports = router;
