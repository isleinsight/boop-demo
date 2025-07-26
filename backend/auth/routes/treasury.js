const express = require("express");
const router = express.Router();
const pool = require("../../db");
const authenticateToken = require("../middleware/authMiddleware");

// ✅ GET treasury balance by wallet ID
router.get("/balance/:walletId", authenticateToken, async (req, res) => {
  const { walletId } = req.params;

  try {
    const result = await pool.query(
      `SELECT balance, currency FROM wallets WHERE id = $1`,
      [walletId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Wallet not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error fetching treasury balance:", err.message);
    res.status(500).json({ message: "Failed to load balance" });
  }
});

// ✅ POST /api/treasury/update-balance/:walletId
router.post("/update-balance/:walletId", authenticateToken, async (req, res) => {
  const { walletId } = req.params;
  const { amount, note } = req.body;
  const user = req.user;

  console.log("🟡 Treasury Adjustment Attempt:");
  console.log("  📌 Wallet ID:", walletId);
  console.log("  💰 Amount:", amount);
  console.log("  📝 Note:", note);
  

  // 🔒 Validation
  if (!walletId || typeof amount !== "number" || !user?.id) {
    console.warn("❗ Invalid input or missing user");
    return res.status(400).json({ message: "Missing or invalid input fields." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Verify wallet exists
    const walletRes = await client.query(
      `SELECT id FROM wallets WHERE id = $1`,
      [walletId]
    );
    if (walletRes.rows.length === 0) {
      console.warn("❌ Wallet not found:", walletId);
      throw new Error("Invalid wallet ID");
    }

    // 2. Insert adjustment transaction
    const txnRes = await client.query(
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
      [
        Math.abs(amount),
        amount < 0 ? walletId : null,
        amount > 0 ? walletId : null,
        note,
        user.id
      ]
    );

    console.log("✅ Transaction inserted:", txnRes.rows[0].id);

    // 3. Update wallet balance
    const update = await client.query(
      `UPDATE wallets
       SET balance = COALESCE(balance, 0) + $1
       WHERE id = $2`,
      [amount, walletId]
    );

    if (update.rowCount === 0) {
      throw new Error("Wallet balance update failed");
    }

    await client.query("COMMIT");
    console.log(`✅ Treasury adjustment SUCCESS for wallet ${walletId} (amount: ${amount})`);
    res.status(200).json({ message: "Adjustment successful." });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("🔥 Treasury adjustment FAILED:", err.message);
    res.status(500).json({ message: "Adjustment failed", error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
