// ─────────────────────────────────────────────
// DEBUG ROUTE — local dev only
// POST /api/debug/dump
// Writes req.body to a timestamped JSON file in api/debug-dumps/
// REMOVE before deploying to production.
// ─────────────────────────────────────────────
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DUMP_DIR = path.join(__dirname, '..', 'debug-dumps');

router.post('/dump', (req, res) => {
  try {
    if (!fs.existsSync(DUMP_DIR)) fs.mkdirSync(DUMP_DIR, { recursive: true });
    const label = req.body?.label || 'dump';
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${label}-${ts}.json`;
    const filepath = path.join(DUMP_DIR, filename);
    fs.writeFileSync(filepath, JSON.stringify(req.body?.data ?? req.body, null, 2), 'utf8');
    console.log(`[debug/dump] wrote ${filepath}`);
    res.json({ ok: true, file: filename });
  } catch (err) {
    console.error('[debug/dump] error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
