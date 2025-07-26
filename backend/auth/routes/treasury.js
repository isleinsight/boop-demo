router.post("/adjust", authenticateToken, async (req, res) => {
  const { wallet_id, amount, note } = req.body;
  const user = req.user;

  const logTag = "[TREASURY ADJUST]";
  console.log(`${logTag} Incoming request...`);
  console.log(`${logTag} Wallet ID: ${wallet_id}`);
  console.log(`${logTag} Amount: ${amount}`);
  console.log(`${logTag} Note: ${note}`);
  console.log(`${logTag} Performed by: ${user?.email || "UNKNOWN"}`);

  if (!wallet_id || typeof amount !== "number" || !user || !user.id) {
    console.error(`${logTag} ❌ Invalid input`);
    return res.status(400).json({ message: "Missing required fields." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const walletRes = await client.query(`SELECT id, balance FROM wallets WHERE id = $1`, [wallet_id]);
    if (walletRes.rows.length === 0) {
      console.error(`${logTag} ❌ Wallet not found for ID: ${wallet_id}`);
      throw new Error("Invalid wallet ID");
    }

    const existingBalance = walletRes.rows[0].balance ?? 0;
    console.log(`${logTag} Existing balance: ${existingBalance}`);

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

    console.log(`${logTag} ✅ Transaction inserted with ID: ${insertTxn.rows[0].id}`);

    const update = await client.query(
      `UPDATE wallets
       SET balance = COALESCE(balance, 0) + $1
       WHERE id = $2`,
      [amount, wallet_id]
    );

    if (update.rowCount === 0) {
      console.error(`${logTag} ❌ Wallet balance not updated`);
      throw new Error("Wallet balance update failed");
    }

    await client.query("COMMIT");
    console.log(`${logTag} ✅ Adjustment complete for ${wallet_id} by ${user.email}`);
    res.status(200).json({ message: "Adjustment successful." });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error(`${logTag} 🔥 ERROR: ${err.message}`);
    res.status(500).json({ message: "Adjustment failed", error: err.message });
  } finally {
    client.release();
  }
});
