// backend/auth/routes/cards.js

const express = require("express");
const router = express.Router();
const db = require("../../db");

// 🚨 Card Type Rules
const validTypes = ["bus", "spending", "assistance"];
const exclusiveGroup = ["spending", "assistance"];

// Create a new card
router.post("/", async (req, res) => {
  const { uid, wallet_id, type = "bus", status = "active", issued_by } = req.body;

  if (!uid || !wallet_id || !issued_by) {
    return res.status(400).json({ error: "UID, wallet_id, and issued_by are required" });
  }

  if (!validTypes.includes(type)) {
    return res.status(400).json({ error: "Invalid card type" });
  }

  try {
    // 🔍 Check for existing cards of the same or conflicting type
    const existing = await db.query(
      `SELECT * FROM cards WHERE wallet_id = $1`,
      [wallet_id]
    );

    for (const card of existing.rows) {
      if (card.type === type) {
        return res.status(409).json({ error: `This wallet already has a ${type} card.` });
      }

      // If adding a spending or assistance card, block the other
      if (exclusiveGroup.includes(card.type) && exclusiveGroup.includes(type)) {
        return res.status(409).json({ error: `Cannot assign both spending and assistance cards.` });
      }
    }

    // ✅ Insert new card
    const result = await db.query(
      `INSERT INTO cards (uid, wallet_id, type, status, issued_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [uid, wallet_id, type, status, issued_by]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error assigning card:", err);
    res.status(500).json({ error: "Failed to assign card" });
  }
});


// Fetch card info by UID
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

    let expiresInText = '';
    if (expired) {
      const daysAgo = Math.abs(daysRemaining);
      expiresInText = daysAgo === 0 ? 'Expired today' :
                      daysAgo === 1 ? 'Expired 1 day ago' :
                      `Expired ${daysAgo} days ago`;
    } else {
      expiresInText = daysRemaining === 0 ? 'Last day' :
                      daysRemaining === 1 ? '1 day left' :
                      daysRemaining < 7 ? `${daysRemaining} days left` :
                      `${Math.ceil(daysRemaining / 7)} weeks left`;
    }

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
    console.error('Error fetching card info:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
