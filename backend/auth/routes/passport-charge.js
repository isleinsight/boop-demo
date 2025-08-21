// ───────────────────────────────────────────────────────────────
// POST /api/vendor/passport-charge
// Body: { passport_id: string, amount: number, note?: string }
router.post("/passport-charge", authenticateToken, requireVendor, async (req, res) => {
  const vendorUserId = req.user?.id || req.user?.userId;
  const { passport_id, amount, note } = req.body || {};

  try {
    // basic validation
    const amt = Number(amount);
    if (!passport_id || !Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ message: "passport_id and positive amount are required" });
    }
    const amountCents = Math.round(amt * 100);

    const client = await (db.pool?.connect ? db.pool.connect() : db.connect?.());
    try {
      await client.query("BEGIN");

      // 1) Resolve BUYER by passport_id (users.passport_id first, fallback to passports table)
      let buyer = null;

      // users.passport_id (if you store it there)
      const r1 = await client.query(
        `SELECT u.id AS user_id, w.id AS wallet_id, w.balance
           FROM users u
           JOIN wallets w ON w.user_id = u.id
          WHERE u.passport_id = $1
          LIMIT 1`,
        [passport_id]
      );
      if (r1.rowCount) buyer = r1.rows[0];

      // fallback: passports table (you renamed to "passports")
      if (!buyer) {
        const r2 = await client.query(
          `SELECT u.id AS user_id, w.id AS wallet_id, w.balance
             FROM passports p
             JOIN users   u ON u.id = p.user_id
             JOIN wallets w ON w.user_id = u.id
            WHERE p.passport_id = $1
            LIMIT 1`,
          [passport_id]
        );
        if (r2.rowCount) buyer = r2.rows[0];
      }

      if (!buyer) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Passport not found" });
      }

      // 2) Resolve VENDOR record + vendor wallet by the current user
      const vendRes = await client.query(
        `SELECT v.id AS vendor_id, w.id AS wallet_id, w.balance
           FROM vendors v
           JOIN users   u ON u.id = v.user_id
           JOIN wallets w ON w.user_id = u.id
          WHERE u.id = $1
          LIMIT 1`,
        [vendorUserId]
      );
      if (!vendRes.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Vendor profile or wallet not found" });
      }
      const vendor = vendRes.rows[0];

      // 3) Lock both wallets deterministically to avoid deadlocks
      const lockIds = [buyer.wallet_id, vendor.wallet_id].sort();
      await client.query(
        `SELECT id FROM wallets WHERE id = ANY($1) FOR UPDATE`,
        [lockIds]
      );

      // 4) Check buyer funds (re-read inside txn)
      const balRes = await client.query(`SELECT balance FROM wallets WHERE id = $1`, [buyer.wallet_id]);
      const buyerBalance = Number(balRes.rows?.[0]?.balance || 0);
      if (buyerBalance < amountCents) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Insufficient funds" });
      }

      // 5) Update balances
      await client.query(
        `UPDATE wallets SET balance = balance - $1 WHERE id = $2`,
        [amountCents, buyer.wallet_id]
      );
      await client.query(
        `UPDATE wallets SET balance = balance + $1 WHERE id = $2`,
        [amountCents, vendor.wallet_id]
      );

      // 6) Insert transactions (double-entry)
      // NOTE: your table has a NOT NULL "user_id" — set it explicitly.

      // Buyer side (debit)
      await client.query(
        `INSERT INTO transactions
           (user_id, type, amount_cents, note, vendor_id, sender_id, recipient_id, created_at)
         VALUES
           ($1,     'debit', $2,          $3,   $4,        $5,        $6,           NOW())`,
        [
          buyer.user_id,           // user_id (required)
          amountCents,             // amount_cents
          note || null,            // note
          vendor.vendor_id,        // vendor_id
          buyer.user_id,           // sender_id
          vendorUserId             // recipient_id (the vendor user)
        ]
      );

      // Vendor side (credit)
      await client.query(
        `INSERT INTO transactions
           (user_id, type, amount_cents, note, vendor_id, sender_id, recipient_id, created_at)
         VALUES
           ($1,     'credit', $2,          $3,   $4,        $5,        $6,           NOW())`,
        [
          vendorUserId,            // user_id (required)
          amountCents,             // amount_cents
          note || null,            // note
          vendor.vendor_id,        // vendor_id
          buyer.user_id,           // sender_id (the buyer)
          vendorUserId             // recipient_id (the vendor)
        ]
      );

      await client.query("COMMIT");
      return res.json({
        status: "success",
        amount_cents: amountCents,
        vendor_id: vendor.vendor_id,
        buyer_id: buyer.user_id,
        message: "Charge completed"
      });
    } catch (err) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("❌ /api/vendor/passport-charge error:", err);
      return res.status(500).json({ message: "Charge failed" });
    } finally {
      if (typeof client?.release === "function") client.release();
    }
  } catch (err) {
    console.error("🔥 passport-charge unhandled:", err);
    return res.status(500).json({ message: "Server error" });
  }
});
