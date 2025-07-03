// Updated route with issued_by

router.post("/", async (req, res) => {
  const { uid, wallet_id, type = "bus", status = "active", issued_by } = req.body;

  if (!uid || !wallet_id || !issued_by) {
    return res.status(400).json({ error: "UID, wallet_id, and issued_by are required" });
  }

  const validTypes = ["bus", "spending"];
  if (!validTypes.includes(type)) {
    return res.status(400).json({ error: "Invalid card type" });
  }

  try {
    const result = await db.query(
      `INSERT INTO cards (uid, wallet_id, type, status, issued_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [uid, wallet_id, type, status, issued_by]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Error assigning card:", err);
    res.status(500).json({ error: "Failed to assign card" });
  }
});
