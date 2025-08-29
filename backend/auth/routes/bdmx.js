// backend/auth/routes/bmdx.js
const express = require('express');
const router = express.Router();

console.log('[bmdx] routes file loaded'); // should print at server boot

let bmdx = null;
try {
  bmdx = require('../services/bmdx'); // routes -> services
  console.log('[bmdx] services module loaded');
} catch (e) {
  console.error('[bmdx] FAILED to load ../services/bmdx:', e?.message || e);
}

/** Log EVERY request that hits this router */
router.use((req, _res, next) => {
  console.log('[bmdx] hit', req.method, req.originalUrl);
  next();
});

/** prove router is mounted */
router.get('/', (_req, res) => {
  res.json({ ok: true, router: 'bmdx', serviceLoaded: !!bmdx });
});

/** plain ping */
router.get('/ping', (_req, res) => {
  res.json({ ok: true, router: 'bmdx/ping', serviceLoaded: !!bmdx });
});

/** health (calls service if available) */
router.get('/health', async (_req, res) => {
  try {
    if (!bmdx || typeof bmdx.health !== 'function') {
      return res.status(503).json({ ok: false, error: 'bmdx service not loaded' });
    }
    const info = await bmdx.health();
    res.json(info);
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

module.exports = router;
