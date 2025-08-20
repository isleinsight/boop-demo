// POST /api/vendor/passport-charge
// Body: { passport_id: string, amount: number, note?: string }
// Effect: debit customer's wallet, credit vendor's wallet, write two txn rows with same reference_code
router.post("/passport-charge", authenticateToken, requireVendor, async (req, res) => {
  const dbOrPool = db.pool?.connect ? { connect: db.pool.connect.bind(db.pool) } : db; // handle either style
  const client = await (dbOrPool.connect ? dbOrPool.connect() : db.connect?.());
  try {
    const userId = req.user?.id || req.user?.userId;
    const { passport_id, amount, note } = req.body || {};

    if (!passport_id || typeof passport_id !== "string") {
      return res.status(400).json({ message: "passport_id is required" });
    }
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ message: "amount must be > 0" });
    }
    const amount_cents = Math.round(amt * 100);

    await client.query("BEGIN");

    // Resolve vendor_id for this signed-in vendor user
    const vendRes = await client.query(
      `SELECT id FROM vendors WHERE user_id = $1 LIMIT 1`,
      [userId]
    );
    if (!vendRes.rowCount) throw new Error("Vendor profile not found.");
    const vendor_id = vendRes.rows[0].id;

    // Resolve customer user by passport_id
    // Try users.passport_id first, else passports table (if you have it)
    let custRes = await client.query(
      `SELECT id AS user_id FROM users WHERE passport_id = $1 LIMIT 1`,
      [passport_id]
    );
    if (!custRes.rowCount) {
      // optional fallback via passports table
      try {
        custRes = await client.query(
          `SELECT u.id AS user_id
             FROM passports p
             JOIN users u ON u.id = p.user_id
            WHERE p.passport_id = $1
            LIMIT 1`,
          [passport_id]
        );
      } catch (_) {}
    }
    if (!custRes.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Passport not found" });
    }
    const customer_id = custRes.rows[0].user_id;

    // Lock both wallets
    const wCust = await client.query(
      `SELECT id, balance FROM wallets WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1 FOR UPDATE`,
      [customer_id]
    );
    const wVend = await client.query(
      `SELECT id, balance FROM wallets WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1 FOR UPDATE`,
      [userId]
    );
    if (!wCust.rowCount) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Customer wallet not found" });
    }
    if (!wVend.rowCount) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Vendor wallet not found" });
    }

    const custBal = Number(wCust.rows[0].balance || 0);
    const vendBal = Number(wVend.rows[0].balance || 0);

    if (custBal < amount_cents) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Insufficient funds" });
    }

    // Update balances
    const newCustBal = custBal - amount_cents;
    const newVendBal = vendBal + amount_cents;

    await client.query(
      `UPDATE wallets SET balance = $1 WHERE id = $2`,
      [newCustBal, wCust.rows[0].id]
    );
    await client.query(
      `UPDATE wallets SET balance = $1 WHERE id = $2`,
      [newVendBal, wVend.rows[0].id]
    );

    // One reference code for both rows
    const reference_code = "PP-" + Math.random().toString(36).slice(2, 10).toUpperCase();

    // Double-entry: customer debit
    await client.query(
      `INSERT INTO transactions
         (type, amount_cents, note, sender_id, recipient_id, vendor_id, reference_code, created_at)
       VALUES
         ('debit', $1, $2, $3, $4, $5, $6, NOW())`,
      [amount_cents, note || null, customer_id, userId, vendor_id, reference_code]
    );

    // Double-entry: vendor credit
    await client.query(
      `INSERT INTO transactions
         (type, amount_cents, note, sender_id, recipient_id, vendor_id, reference_code, created_at)
       VALUES
         ('credit', $1, $2, $3, $4, $5, $6, NOW())`,
      [amount_cents, note || null, customer_id, userId, vendor_id, reference_code]
    );

    await client.query("COMMIT");

    return res.json({
      message: "Charge completed",
      reference_code,
      amount_cents,
      customer_id,
      vendor_id
    });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error("❌ /api/vendor/passport-charge error:", err);
    res.status(500).json({ message: "Charge failed" });
  } finally {
    if (client?.release) client.release();
  }
});
