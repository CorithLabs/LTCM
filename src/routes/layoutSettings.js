const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { requireAdmin } = require('../middleware/auth');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const LAYOUT_PATH = path.join(DATA_DIR, 'layout.json');
const FAVICON_BASE = path.join(DATA_DIR, 'favicon');
const FAVICON_EXTS = ['.png', '.ico', '.svg', '.jpg', '.jpeg', '.webp'];

const DEFAULTS = { appName: 'LTCM', iconName: 'FlaskConical' };

function readLayout() {
  if (fs.existsSync(LAYOUT_PATH)) {
    try { return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(LAYOUT_PATH, 'utf8')) }; }
    catch { return { ...DEFAULTS }; }
  }
  return { ...DEFAULTS };
}

function writeLayout(data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(LAYOUT_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function findFaviconPath() {
  for (const ext of FAVICON_EXTS) {
    const p = FAVICON_BASE + ext;
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// Public handlers (registered before requireAuth in app.js)
function getLayout(req, res) {
  const layout = readLayout();
  res.json({ ...layout, hasFavicon: !!findFaviconPath() });
}

function getFavicon(req, res) {
  const p = findFaviconPath();
  if (!p) return res.status(404).json({ error: 'No custom favicon', code: 'NOT_FOUND' });
  res.sendFile(p);
}

// PATCH /api/v1/settings/layout — admin only
router.patch('/', requireAdmin, (req, res) => {
  const { appName, iconName } = req.body;
  const current = readLayout();
  const updated = {
    ...current,
    ...(appName !== undefined ? { appName: (appName || '').trim() || 'LTCM' } : {}),
    ...(iconName !== undefined ? { iconName } : {}),
  };
  writeLayout(updated);
  res.json(updated);
});

// DELETE /api/v1/settings/layout/favicon — admin only
router.delete('/favicon', requireAdmin, (req, res) => {
  const p = findFaviconPath();
  if (p) fs.unlinkSync(p);
  res.json({ ok: true });
});

// POST /api/v1/settings/layout/favicon — admin only
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    FAVICON_EXTS.forEach(ext => { try { fs.unlinkSync(FAVICON_BASE + ext); } catch {} });
    cb(null, DATA_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    cb(null, 'favicon' + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 1 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    cb(null, FAVICON_EXTS.includes(path.extname(file.originalname).toLowerCase()));
  },
});

router.post('/favicon', requireAdmin, upload.single('favicon'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No valid file uploaded', code: 'VALIDATION_ERROR' });
  res.json({ ok: true, url: `/api/v1/settings/layout/favicon?v=${Date.now()}` });
});

module.exports = { router, getLayout, getFavicon };
