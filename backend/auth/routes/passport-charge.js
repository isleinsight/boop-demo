// backend/auth/routes/passport-charge.js
const express = require("express");
const router = express.Router();
const db = require("../../db");
const { authenticateToken } = require("../middleware/authMiddleware");
const crypto = require("crypto");

/**
 * Idempotency storage (Postgres)
 *
 * Suggested DDL:
 *   CREATE TABLE IF NOT EXISTS idempotency_keys (
 *     id bigserial PRIMARY KEY,
 *     user_id uuid NOT NULL,
 *     idem_key text NOT NULL,
 *     request_fingerprint text,
 *     status_code integer,
 *     response_json jsonb,
 *     created_at timestamptz NOT NULL DEFAULT now(),
 *     expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
 *     UNIQUE (user_id, idem_key)
 *   );
 */

/** Require the caller to be a vendor user */
function requireVendor(req, res, next) {
  const role = (req.user?.role || "").toLowerCase();
  if (role !== "vendor") {
    return res.status(403).json({ message: "Vendor role required." });
  }
  next();
}

// Helpers --------------------------------------------------------------------
function normalizeAmountToCents({ amount, amount_cents }) {
  if (Number.isFinite(amount_cents)) {
    const c = Math.round(Number(amount_cents));
    return c > 0 ? c : null;
  }
  if (Number.isFinite(Number(amount))) {
    const d = Number(amount);
    const c = Math.round(d * 100);
    return c > 0 ? c : null;
  }
  return null;
}

function fingerprintPayload(vendorUserId, body) {
  // Include critical fields so key-reuse with different payloads is rejected
  const pid = body?.pid || body?.passport_id || "";
  const cents = normalizeAmountToCents(body) ?? 0;
  const note = (body?.note || "").slice(0, 200);
  const material = JSON.stringify({ vendorUserId, pid, cents, note });
  return crypto.createHash("sha256").update(material).digest("hex");
}

async function upsertIdemStart({ vendorUserId, idemKey, requestFp }) {
  // Try to claim leadership by inserting; if row exists, DO NOTHING
  const insertSql = `
    INSERT INTO idempotency_keys (user_id, idem_key, request_fingerprint)
    VALUES ($1, $2, $3)
    ON CONFLICT (user_id, idem_key) DO NOTHING
    RETURNING 1
  `;
  const ins = await db.query(insertSql, [vendorUserId, idemKey, requestFp]);
  const isLeader = ins.rowCount === 1;

  const rowSql = `
    SELECT request_fingerprint, status_code, response_json, expires_at
      FROM idempotency_keys
     WHERE user_id = $1 AND idem_key = $2
     LIMIT 1
  `;
  const row = (await db.query(rowSql, [vendorUserId, idemKey])).rows[0] || null;
  return { isLeader, row };
}

async function saveIdemResult({ vendorUserId, idemKey, statusCode, responseObj }) {
  try {
    await db.query(
      `UPDATE idempotency_keys
          SET status_code = $3,
              response_json = $4,
              expires_at = now() + interval '24 hours'
        WHERE user_id = $1 AND idem_key = $2`,
      [vendorUserId, idemKey, statusCode, JSON.stringify(responseObj)]
    );
  } catch (e) {
    console.warn("idempotency save failed:", e?.message || e);
  }
}

// Route ----------------------------------------------------------------------
/**
 * POST /api/vendor/passport-charge
 * Body: { pid?: string, passport_id?: string, amount?: number, amount_cents?: number, note?: string }
 * Header: Idempotency-Key: <string>  (recommended)
 */
router.post(
  "/passport-charge",
  authenticateToken,
  requireVendor,
  async (req, res) => {
    const vendorUserId = req.user?.id || req.user?.userId;
    const { note } = req.body || {};
    const pid = (req.body?.pid || req.body?.passport_id || "").trim();
    const cents = normalizeAmountToCents(req.body || {});

    // Validate input ---------------------------------------------------------
    if (!pid) {
      return res.status(400).json({ message: "pid (passport id) is required" });
    }
    if (!Number.isFinite(cents) || cents <= 0) {
      return res.status(400).json({ message: "Provide a positive amount or amount_cents" });
    }

    // Idempotency gate -------------------------------------------------------
    const idemKey = String(req.get("Idempotency-Key") || req.body?.idempotency_key || "").trim();
    const useIdem = idemKey.length > 0;

    let followerWaited = false;
    if (useIdem) {
      const fp = fingerprintPayload(vendorUserId, req.body);
      const { isLeader, row } = await upsertIdemStart({ vendorUserId, idemKey, requestFp: fp });

      if (row && row.request_fingerprint && row.request_fingerprint !== fp) {
        return res.status(409).json({ message: "Idempotency-Key reuse with different payload" });
      }

      if (!isLeader) {
        // Another request is (or was) handling this key. If there is a stored response, return it.
        if (row?.response_json) {
          return res.status(row.status_code || 200).json(row.response_json);
        }
        // Otherwise, poll briefly waiting for the original to finish.
        const started = Date.now();
        while (Date.now() - started < 6000) { // up to 6s
          await new Promise((r) => setTimeout(r, 150));
          const again = (
            await db.query(
              `SELECT status_code, response_json FROM idempotency_keys WHERE user_id = $1 AND idem_key = $2`,
              [vendorUserId, idemKey]
            )
          ).rows[0];
          if (again?.response_json) {
            followerWaited = true;
            return res.status(again.status_code || 200).json(again.response_json);
          }
        }
        // Still not finished → tell client to retry later (won’t double-charge once stored)
        return res.status(202).json({ message: "Processing in progress. Please retry." });
      }
      // isLeader → proceed to perform the charge; after completion store result
    }

    // Perform charge in a single DB transaction -----------------------------
    const client = await db.connect();
    try {
      await client.query("BEGIN");

      // 1) Resolve buyer via passports table → users → wallets
      const buyerQ = `
        SELECT u.id   AS user_id,
               w.id   AS wallet_id,
               COALESCE(w.balance, 0)::bigint AS balance
          FROM passports p
          JOIN users     u ON u.id = p.user_id
          JOIN wallets   w ON w.user_id = u.id
         WHERE p.passport_id = $1
         LIMIT 1
      `;
      const buyerRes = await client.query(buyerQ, [pid]);
      if (!buyerRes.rowCount) {
        await client.query("ROLLBACK");
        const errRes = { message: "Passport not found" };
        if (useIdem) await saveIdemResult({ vendorUserId, idemKey, statusCode: 404, responseObj: errRes });
        return res.status(404).json(errRes);
      }
      const buyer = buyerRes.rows[0];

      // 2) Resolve vendor_id + vendor wallet from current vendor user
      const vendQ = `
        SELECT v.id AS vendor_id,
               w.id AS wallet_id,
               COALESCE(w.balance, 0)::bigint AS balance
          FROM vendors v
          JOIN users   u ON u.id = v.user_id
          JOIN wallets w ON w.user_id = u.id
         WHERE u.id = $1
         LIMIT 1
      `;
      const vendRes = await client.query(vendQ, [vendorUserId]);
      if (!vendRes.rowCount) {
        await client.query("ROLLBACK");
        const errRes = { message: "Vendor profile or wallet not found" };
        if (useIdem) await saveIdemResult({ vendorUserId, idemKey, statusCode: 404, responseObj: errRes });
        return res.status(404).json(errRes);
      }
      const vendor = vendRes.rows[0];

      // 3) Lock both wallets (sorted) to avoid deadlocks
      const lockIds = [buyer.wallet_id, vendor.wallet_id].sort();
      await client.query(`SELECT id FROM wallets WHERE id = ANY($1) FOR UPDATE`, [lockIds]);

      // 4) Recheck buyer balance under lock
      const balRes = await client.query(
        `SELECT COALESCE(balance,0)::bigint AS balance FROM wallets WHERE id = $1`,
        [buyer.wallet_id]
      );
      const buyerBal = Number(balRes.rows?.[0]?.balance || 0);
      if (buyerBal < cents) {
        await client.query("ROLLBACK");
        const errRes = { message: "Insufficient funds" };
        if (useIdem) await saveIdemResult({ vendorUserId, idemKey, statusCode: 400, responseObj: errRes });
        return res.status(400).json(errRes);
      }

      // 5) Update balances
      await client.query(`UPDATE wallets SET balance = balance - $1 WHERE id = $2`, [cents, buyer.wallet_id]);
      await client.query(`UPDATE wallets SET balance = balance + $1 WHERE id = $2`, [cents, vendor.wallet_id]);

      // 6) Insert transactions (double-entry)
      const currency = "BMD"; // adjust if multi-currency later

      // Buyer side (money leaving) → type = 'debit'
      await client.query(
        `INSERT INTO transactions
           (type, amount_cents, currency, note, vendor_id, user_id, sender_id, recipient_id, created_at)
         VALUES
           ('debit', $1, $2, $3, $4, $5, $6, $7, NOW())`,
        [cents, currency, note || null, vendor.vendor_id, buyer.user_id, buyer.user_id, vendorUserId]
      );

      // Vendor side (money coming in) → type = 'credit'
      await client.query(
        `INSERT INTO transactions
           (type, amount_cents, currency, note, vendor_id, user_id, sender_id, recipient_id, created_at)
         VALUES
           ('credit', $1, $2, $3, $4, $5, $6, $7, NOW())`,
        [cents, currency, note || null, vendor.vendor_id, vendorUserId, buyer.user_id, vendorUserId]
      );

      await client.query("COMMIT");

      const okRes = {
        status: "success",
        amount_cents: cents,
        vendor_id: vendor.vendor_id,
        buyer_id: buyer.user_id,
        message: "Charge completed",
      };
      if (useIdem) await saveIdemResult({ vendorUserId, idemKey, statusCode: 200, responseObj: okRes });
      return res.status(200).json(okRes);
    } catch (err) {
      try { await db.query("ROLLBACK"); } catch {}
      console.error("❌ /api/vendor/passport-charge error:", err);
      const errRes = { message: "Charge failed" };
      if (useIdem) await saveIdemResult({ vendorUserId, idemKey, statusCode: 500, responseObj: errRes });
      return res.status(500).json(errRes);
    } finally {
      try { if (client?.release) client.release(); } catch {}
    }
  }
);

module.exports = router;
