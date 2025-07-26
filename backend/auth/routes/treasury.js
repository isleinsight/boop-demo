// backend/auth/routes/treasury.js
const express = require("express");
const router = express.Router();
const pool = require("../../db");
const authenticateToken = require("../middleware/authMiddleware");

router.post("/adjust", authenticateToken, async (req, res) => {
  const { wallet_id, amount, note } = req.body;
  const user = req.user;

  console.log("🟡 Treasury Adjustment Attempt:");
  console.log("  📌 Wallet ID:", wallet_id);
  console.log("  💰 Amount:", amount);
  console.log("  📝 Note:", note);
  console.log("  👤 Performed By:", user?.email || "Unknown");

  if (!wallet_id || typeof amount !== "number" || !user?.id) {
    console.warn("❗ Invalid input or missing user");
    return res.status(400).json({ message: "Missing required fields." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Verify wallet exists
    const walletRes = await client.query(`SELECT id FROM wallets WHERE id = $1`, [wallet_id]);
    if (walletRes.rows.length === 0) {
      console.warn("❌ Wallet not found:", wallet_id);
      throw new Error("Invalid wallet ID");
    }

    // 2. Insert adjustment transaction
    const insertTxn = await client.query(
      `INSERT INTO transactions (
         amount, from_wallet_id, to_wallet_id, note, created_by, category
       ) VALUES (
         $1,
         $2,
         $3,
         $4,
         $5,
         'treasury-adjustment'
       ) RETURNING id`,
      [Math.abs(amount), amount < 0 ? wallet_id : null, amount > 0 ? wallet_id : null, note, user.id]
    );

    const txnId = insertTxn.rows[0].id;
    console.log("✅ Transaction inserted:", txnId);

    // 3. Update wallet balance
    const update = await client.query(
      `UPDATE wallets
       SET balance = COALESCE(balance, 0) + $1
       WHERE id = $2`,
      [amount, wallet_id]
    );

    if (update.rowCount === 0) {
      console.warn("⚠️ Wallet balance not updated");
      throw new Error("Wallet balance update failed");
    }

    await client.query("COMMIT");

    console.log(`✅ Treasury adjustment successful for wallet ${wallet_id} (amount: ${amount})`);
    res.status(200).json({ message: "Adjustment successful." });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("🔥 Treasury adjustment failed:", err.message);
    res.status(500).json({ message: "Adjustment failed", error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
