// backend/auth/routes/treasury.js
const express = require("express");
const router = express.Router();
const pool = require("../../db");
const authenticateToken = require("../middleware/authMiddleware");

router.post("/adjust", authenticateToken, async (req, res) => {
  const { wallet_id, amount, note } = req.body;
  const user = req.user;

  const logTag = "[treasury-adjustment]";
  console.log(`${logTag} 📤 Adjustment Attempt`);
  console.log(`${logTag} 🔗 Wallet ID: ${wallet_id}`);
  console.log(`${logTag} 💵 Amount: ${amount}`);
  console.log(`${logTag} 🧾 Note: ${note}`);
  console.log(`${logTag} 👤 Performed by: ${user?.email || "UNKNOWN"}`);

  if (!wallet_id || typeof amount !== "number" || !user?.id) {
    console.warn(`${logTag} ❌ Invalid input`);
    return res.status(400).json({ message: "Missing required fields." });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 🔍 1. Ensure wallet exists
    const { rows: walletRows } = await client.query(
      "SELECT id FROM wallets WHERE id = $1",
      [wallet_id]
    );
    if (walletRows.length === 0) {
      console.warn(`${logTag} ❌ Wallet not found: ${wallet_id}`);
      throw new Error("Invalid wallet ID");
    }

    // 🧾 2. Insert transaction log
    const { rows: txnRows } = await client.query(
      `INSERT INTO transactions (
         amount, from_wallet_id, to_wallet_id, note, created_by, category
       ) VALUES (
         $1, $2, $3, $4, $5, 'treasury-adjustment'
       ) RETURNING id`,
      [
        Math.abs(amount),
        amount < 0 ? wallet_id : null,
        amount > 0 ? wallet_id : null,
        note,
        user.id,
      ]
    );

    console.log(`${logTag} ✅ Transaction created: ${txnRows[0].id}`);

    // 💰 3. Update balance
    const updateRes = await client.query(
      `UPDATE wallets
       SET balance = COALESCE(balance, 0) + $1
       WHERE id = $2`,
      [amount, wallet_id]
    );

    if (updateRes.rowCount === 0) {
      throw new Error("Balance update failed");
    }

    await client.query("COMMIT");

    console.log(`${logTag} ✅ Treasury adjustment committed for wallet ${wallet_id}`);
    res.status(200).json({ message: "Adjustment successful." });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error(`${logTag} 🔥 Adjustment failed:`, err.message);
    res.status(500).json({ message: "Adjustment failed", error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
