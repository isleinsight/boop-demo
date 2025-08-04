// backend/auth/routes/cards.js

const express = require("express");
const router = express.Router();
const db = require("../../db");

const validTypes = ["spending", "assistance", "transit"];
const exclusiveGroup = ["spending", "assistance"];

// Create a new card
router.post("/", async (req, res) => {
  const { uid, wallet_id, type = "bus", status = "active", issued_by } = req.body;

  console.log("🔔 Incoming card assignment:", { uid, wallet_id, type, status, issued_by });

  if (!uid || !wallet_id || !issued_by) {
    console.warn("⚠️ Missing required fields:", { uid, wallet_id, issued_by });
    return res.status(400).json({ error: "UID, wallet_id, and issued_by are required" });
  }

  if (!validTypes.includes(type)) {
    console.warn("⚠️ Invalid card type:", type);
    return res.status(400).json({ error: "Invalid card type" });
  }

  try {
    const existing = await db.query(
      `SELECT * FROM cards WHERE wallet_id = $1`,
      [wallet_id]
    );

    for (const card of existing.rows) {
      if (card.type === type) {
        console.warn(`⚠️ Wallet already has a ${type} card`);
        return res.status(409).json({ message: `User already has a ${type} card.` });
      }

      if (exclusiveGroup.includes(card.type) && exclusiveGroup.includes(type)) {
        console.warn("⚠️ Conflict between spending and assistance cards");
        return res.status(409).json({ message: `User cannot have both spending and assistance cards.` });
      }
    }

    const result = await db.query(
  `INSERT INTO cards (uid, wallet_id, type, status, issued_by)
   VALUES ($1, $2, $3, $4, $5)
   RETURNING *`,
  [uid, wallet_id, type, status, issued_by]
);

// Log the action in admin_actions
await db.query(
  `INSERT INTO admin_actions (action, type, status, performed_by, target_user_id, created_at, completed_at)
   SELECT 'assign_card', 'card', 'completed', $1, u.id, NOW(), NOW()
   FROM users u
   WHERE u.wallet_id = $2`,
  [issued_by, wallet_id]
);

console.log("✅ Card successfully inserted:", result.rows[0]);
res.status(201).json(result.rows[0]);

  } catch (err) {
    console.error("❌ DB insert error:", err);
    res.status(500).json({ error: "Failed to assign card" });
  }
});

// Get full card info by UID
router.get('/:uid', async (req, res) => {
  const { uid } = req.params;

  try {
    const result = await db.query(
      `SELECT uid, type, status, zone, expires_at FROM cards WHERE uid = $1`,
      [uid]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Card not found' });
    }

    const card = result.rows[0];
    const now = new Date();
    const expiresAt = new Date(card.expires_at);
    const msDiff = expiresAt - now;
    const daysRemaining = Math.ceil(msDiff / (1000 * 60 * 60 * 24));
    const expired = msDiff <= 0;

    let expiresInText = expired
      ? (Math.abs(daysRemaining) === 0 ? 'Expired today' :
         Math.abs(daysRemaining) === 1 ? 'Expired 1 day ago' :
         `Expired ${Math.abs(daysRemaining)} days ago`)
      : (daysRemaining === 0 ? 'Last day' :
         daysRemaining === 1 ? '1 day left' :
         daysRemaining < 7 ? `${daysRemaining} days left` :
         `${Math.ceil(daysRemaining / 7)} weeks left`);

    res.json({
      uid: card.uid,
      type: card.type,
      status: card.status,
      zone: card.zone,
      expires_at: card.expires_at,
      days_remaining: daysRemaining,
      expired,
      expires_in_text: expiresInText
    });

  } catch (err) {
    console.error('❌ Error fetching card info:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ✅ Get all cards by wallet_id
router.get("/", async (req, res) => {
  const { wallet_id } = req.query;

  if (!wallet_id) {
    return res.status(400).json({ error: "Missing wallet_id" });
  }

  try {
    const result = await db.query(
      `SELECT * FROM cards WHERE wallet_id = $1 ORDER BY issued_at DESC`,
      [wallet_id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching card by wallet_id:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
