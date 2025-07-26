const express = require("express");
const router = express.Router();
const db = require("../../db"); // adjust if your db connection path is different
const auth = require("../../middleware/auth"); // your auth middleware

// 🧠 Assumes there is ONE treasury wallet (created ahead of time)
const TREASURY_WALLET_ID = "replace-this-with-your-wallet-id"; // or fetch dynamically

// Middleware: only 'admin' + 'treasury/accountant' allowed
function requireTreasuryAdmin(req, res, next) {
  const user = req.user;
  if (!user || user.role !== "admin" || !["treasury", "accountant"].includes(user.type)) {
    return res.status(403).json({ message: "Unauthorized access" });
  }
  next();
}

// GET /api/treasury/balance
router.get("/balance", auth, requireTreasuryAdmin, async (req, res) => {
  try {
    const { rows } = await db.query("SELECT balance_cents FROM wallets WHERE id = $1", [TREASURY_WALLET_ID]);
    if (!rows.length) return res.status(404).json({ message: "Treasury wallet not found" });
    res.json({ balance_cents: rows[0].balance_cents });
  } catch (err) {
    console.error("Error fetching treasury balance:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/treasury/adjust
router.post("/adjust", auth, requireTreasuryAdmin, async (req, res) => {
  const { amount_cents, type, note } = req.body;
  const adminId = req.user?.id;

  if (!amount_cents || !["credit", "debit"].includes(type) || !note) {
    return res.status(400).json({ message: "Invalid input" });
  }

  const operator = type === "credit" ? "+" : "-";

  try {
    await db.query("BEGIN");

    await db.query(`
      UPDATE wallets
      SET balance_cents = balance_cents ${operator} $1
      WHERE id = $2
    `, [amount_cents, TREASURY_WALLET_ID]);

    await db.query(`
      INSERT INTO treasury_transactions (wallet_id, amount_cents, type, note, performed_by)
      VALUES ($1, $2, $3, $4, $5)
    `, [TREASURY_WALLET_ID, amount_cents, type, note, adminId]);

    await db.query("COMMIT");
    res.json({ success: true });
  } catch (err) {
    await db.query("ROLLBACK");
    console.error("Error adjusting treasury:", err);
    res.status(500).json({ message: "Failed to adjust balance" });
  }
});

module.exports = router;
