const express = require("express");
const router = express.Router();
const db = require("../../db");

// 🎯 Create a new transit card (for user or temp user)
router.post("/", async (req, res) => {
  const {
    uid,
    user_id,
    temporary_user,
    mode,
    pass_type,
    pass_value,
    issued_by
  } = req.body;

  console.log("🚏 Incoming transit card request:", {
    uid, user_id, temporary_user, mode, pass_type, pass_value, issued_by
  });

  if (!uid || !mode || !pass_type || !pass_value || !issued_by) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  // ⏳ Calculate expiration
  let expires_at = null;
  if (pass_type === "time") {
    const days = parseInt(pass_value);
    const now = new Date();
    now.setDate(now.getDate() + days);
    expires_at = now;
  }

  let tempUserId = null;
  try {
    if (!user_id && temporary_user) {
      const tempRes = await db.query(
        `INSERT INTO temporary_users (email, pass_type, expires_at)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [temporary_user.email, pass_type, expires_at]
      );
      tempUserId = tempRes.rows[0].id;
    }

    const insertRes = await db.query(
      `INSERT INTO transit_cards (
         uid, user_id, temporary_user_id, mode, pass_type,
         pass_value, issued_by, expires_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [uid, user_id || null, tempUserId, mode, pass_type, pass_value, issued_by, expires_at]
    );

    console.log("✅ Transit card created:", insertRes.rows[0]);
    res.status(201).json(insertRes.rows[0]);

  } catch (err) {
    console.error("❌ Transit card creation failed:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
