const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const { readLastLines, APP_LOG, ACCESS_LOG } = require('../logger');

router.get('/logs/app', requireAdmin, (req, res) => {
  const n = Math.min(parseInt(req.query.lines) || 200, 1000);
  res.json({ lines: readLastLines(APP_LOG, n) });
});

router.get('/logs/access', requireAdmin, (req, res) => {
  const n = Math.min(parseInt(req.query.lines) || 200, 1000);
  res.json({ lines: readLastLines(ACCESS_LOG, n) });
});

module.exports = router;
