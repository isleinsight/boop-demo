const express = require("express");
const router = express.Router();
const db = require("../../db");
const { authenticateToken } = require("../middleware/authMiddleware");

// ✅ PATCH /api/wallets/:walletId — Update wallet status and log action
router.patch("/:walletId", authenticateToken, async (req, res) => {
  const { walletId } = req.params;
  const { status, user_id } = req.body;
  const adminId = req.user.id; // from token

  const validStatuses = ["active", "suspended", "archived", "pending"];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: "Invalid wallet status" });
  }

  try {
    // 🔁 1. Update wallet
    const result = await db.query(
      `UPDATE wallets SET status = $1 WHERE id = $2 RETURNING *`,
      [status, walletId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Wallet not found" });
    }

    const actionType = status === "suspended" ? "suspend" :
                       status === "active" ? "unsuspend" :
                       "update_wallet";

    // 📝 2. Log to admin_actions table
    await db.query(`
      INSERT INTO admin_actions (
        id, performed_by, target_user_id, action, status, requested_at, created_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, 'completed', NOW(), NOW()
      )
    `, [adminId, user_id, actionType]);

    res.json({ message: "Wallet status updated", wallet: result.rows[0] });

  } catch (err) {
    console.error("❌ Error updating wallet:", err);
    res.status(500).json({ error: "Failed to update wallet status" });
  }
});
