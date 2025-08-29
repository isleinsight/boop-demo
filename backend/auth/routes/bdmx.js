# from anywhere on the box
cat >/root/boop-demo/backend/auth/routes/bmdx.js <<'EOF'
const express = require('express');
const router = express.Router();

// Debug: prove the router file actually loads
console.log('[bmdx] router file loaded');

let bmdx;
try {
  // routes/ -> services/
  bmdx = require('../services/bmdx');
  console.log('[bmdx] services module loaded');
} catch (e) {
  console.error('[bmdx] FAILED to load services/bmdx.js:', e.message);
}

/** Simple ping so we can confirm the mount works without touching the service */
router.get('/ping', (_req, res) => {
  res.json({ ok: true, router: 'bmdx', serviceLoaded: !!bmdx });
});

/** Health check that calls the service (if loaded) */
router.get('/health', async (_req, res) => {
  try {
    if (!bmdx || !bmdx.health) {
      return res.status(503).json({ ok: false, error: 'bmdx service not loaded' });
    }
    const info = await bmdx.health();
    res.json(info);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
EOF
