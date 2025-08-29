cat >/root/boop-demo/backend/auth/routes/bmdx.js <<'EOF'
const express = require('express');
const router = express.Router();

console.log('[bmdx] router file loaded');  // proves require() worked

// log anything hitting this router
router.use((req, _res, next) => {
  console.log('[bmdx] incoming:', req.method, req.originalUrl);
  next();
});

// simple root to prove mount works
router.get('/', (_req, res) => {
  res.json({ ok: true, where: '/api/bmdx/' });
});

let bmdx;
try {
  bmdx = require('../services/bmdx');   // routes/ -> services/
  console.log('[bmdx] services module loaded');
} catch (e) {
  console.error('[bmdx] FAILED to load services/bmdx.js:', e.message);
}

// ping: no blockchain calls
router.get('/ping', (_req, res) => {
  res.json({ ok: true, router: 'bmdx', serviceLoaded: !!bmdx });
});

// health: uses the service if available
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
