// backend/auth/routes/transit-cards.js

const express = require("express");
const router = express.Router();
const db = require("../../db");

// POST /api/transit-cards
router.post("/", async (req, res) => {
  const {
    uid,
    mode,
    pass_type,
    pass_value,
    issued_by,
    user_id,
    temporary_user
  } = req.body;

  console.log("🔄 Transit card request:", {
    uid,
    mode,
    pass_type,
    pass_value,
    issued_by,
    user_id,
    temporary_user
  });

  if (!uid || !mode || !pass_type || !pass_value || !issued_by) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    // If assigning to existing user
    if (user_id) {
      // Check if user already has a transit card
      const existing = await db.query(
        `SELECT * FROM transit_cards WHERE user_id = $1`,
        [user_id]
      );
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: "User already has a transit card." });
      }

      const result = await db.query(
        `INSERT INTO transit_cards (uid, mode, pass_type, pass_value, issued_by, user_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [uid, mode, pass_type, pass_value, issued_by, user_id]
      );
      return res.status(201).json(result.rows[0]);

    } else if (temporary_user) {
      const { email } = temporary_user;

      // Insert into temporary_users
      const tempResult = await db.query(
        `INSERT INTO temporary_users (email, pass_type, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '30 days')
         RETURNING id`,
        [email, pass_type]
      );

      const tempUserId = tempResult.rows[0].id;

      const result = await db.query(
        `INSERT INTO transit_cards (uid, mode, pass_type, pass_value, issued_by, temporary_user_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [uid, mode, pass_type, pass_value, issued_by, tempUserId]
      );
      return res.status(201).json(result.rows[0]);
    } else {
      return res.status(400).json({ error: "User or temporary user is required." });
    }

  } catch (err) {
    console.error("❌ Error inserting transit card:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
