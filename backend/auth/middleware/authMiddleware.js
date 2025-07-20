const express = require("express");
const router = express.Router();
const pool = require("../../db");

// ⛔ DO NOT include authenticateToken here

router.post("/", async (req, res) => {
  const { email, user_id, jwt_token, expires_at, status } = req.body;

  if (!email || !user_id || !jwt_token || !expires_at || !status) {
    return res.status(400).json({ message: "Missing session data" });
  }

  try {
    await pool.query(
      `INSERT INTO sessions (email, user_id, jwt_token, expires_at, status)
       VALUES ($1, $2, $3, $4, $5)`,
      [email, user_id, jwt_token, expires_at, status]
    );

    res.status(201).json({ message: "Session recorded" });
  } catch (err) {
    console.error("❌ Failed to insert session:", err.message);
    res.status(500).json({ message: "Failed to create session" });
  }
});

module.exports = router;
