require('dotenv').config({ path: __dirname + '/../.env' });
const crypto = require('crypto');
const cron = require('node-cron');
const pool = require('../db');               // your existing pg pool
const bmdx = require('../auth/services/bmdx');

const ENABLE_WRITES = String(process.env.BMDX_ENABLE_WRITES || 'false').toLowerCase() === 'true';
const ADMIN_LOG = (msg, extra={}) => console.log('[bmdx-weekly]', msg, extra);

// Canonical stringify (stable key order) so the same input -> same hash
function stableStringify(obj) {
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    const out = {};
    for (const k of Object.keys(obj).sort()) out[k] = stableStringify(obj[k]);
    return out;
  }
  if (Array.isArray(obj)) return obj.map(stableStringify);
  return obj;
}
function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

// Pull the **previous week** (Mon 00:00 → Mon 00:00 UTC). Adjust if your “week” differs.
async function fetchPreviousWeek() {
  const sql = `
    WITH bounds AS (
      SELECT date_trunc('week', (now() AT TIME ZONE 'UTC'))  AS this_week_utc,
             date_trunc('week', (now() AT TIME ZONE 'UTC')) - interval '7 days' AS last_week_utc
    )
    SELECT t.*
      FROM transactions t, bounds b
     WHERE t.created_at >= b.last_week_utc
       AND t.created_at <  b.this_week_utc
     ORDER BY t.created_at, t.id;
  `;
  const { rows } = await pool.query(sql);
  return rows;
}

async function runOnce() {
  try {
    // 1) fetch data
    const rows = await fetchPreviousWeek();

    // 2) strip/shape to exactly what you want to attest (no PII)
    const payload = rows.map(r => ({
      id: r.id,
      user_id: r.user_id,
      amount_cents: r.amount_cents,
      currency: r.currency,
      type: r.type,
      state: r.state,
      created_at: r.created_at ? new Date(r.created_at).toISOString() : null,
    }));

    // 3) canonical JSON + hash
    const canonical = JSON.stringify(stableStringify(payload));
    const digest = sha256Hex(canonical);

    ADMIN_LOG('computed weekly digest', { count: payload.length, digest });

    // 4) optionally publish to chain
    if (ENABLE_WRITES) {
      const out = await bmdx.setDailyHash(digest);
      ADMIN_LOG('published digest to chain', out);
      return { ok:true, published:true, digest, ...out };
    } else {
      ADMIN_LOG('writes disabled; digest logged only');
      return { ok:true, published:false, digest };
    }
  } catch (e) {
    console.error('[bmdx-weekly] failed:', e.message);
    return { ok:false, error:e.message };
  }
}

// Schedule: every Monday 00:10 UTC (covers the previous week)
function start() {
  ADMIN_LOG('scheduler start (Mon 00:10 UTC, prev week)');
  cron.schedule('10 0 * * 1', runOnce, { timezone: 'UTC' });
}

module.exports = { start, runOnce };
