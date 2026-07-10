const express = require('express');
const path = require('path');
const compression = require('compression');
const fs = require('fs');
const { spawn } = require('child_process');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const { version } = require('../package.json');
const { getDbConfig } = require('./dbConfig');
const { isConnected, getPool } = require('./db');
const { requireAuth } = require('./middleware/auth');
const { logAccess, startLogCleanup } = require('./logger');
const rateLimit = require('express-rate-limit');

const globalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 500, standardHeaders: true, legacyHeaders: false });
const authLimiter  = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20,  standardHeaders: true, legacyHeaders: false });

function createApp() {
  const app = express();
  app.use(compression());
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/', globalLimiter);
  app.use('/api/v1/auth/login', authLimiter);

  // Session middleware
  app.use(session({
    store: new PgSession({ pool: getPool(), tableName: 'session', createTableIfMissing: false }),
    secret: process.env.SESSION_SECRET || 'ltcm-local-secret-change-in-prod',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      // App is served over plain HTTP on localhost even in production mode —
      // a Secure cookie would be dropped by the browser. Opt in via COOKIE_SECURE=true when behind HTTPS.
      secure: process.env.COOKIE_SECURE === 'true',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  }));

  // Access logging — after session so username is available
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/') && req.path !== '/api/v1/health') {
      const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
      res.on('finish', () => {
        logAccess(ip, req.session?.username || 'unknown', req.method, req.path);
      });
    }
    next();
  });

  // Auth routes — unprotected
  app.use('/api/v1/auth', require('./routes/auth'));

  // Public layout settings (needed for login page branding)
  const layoutSettings = require('./routes/layoutSettings');
  app.get('/api/v1/settings/layout', layoutSettings.getLayout);
  app.get('/api/v1/settings/layout/favicon', layoutSettings.getFavicon);

  // All routes below require authentication
  app.use('/api/v1', requireAuth);

  // API routes
  app.use('/api/v1/users', require('./routes/users'));
  app.use('/api/v1/projects', require('./routes/projects'));

  const suitesRouter = require('./routes/suites');
  app.use('/api/v1/projects/:projectId/suites', suitesRouter);
  app.use('/api/v1/suites', suitesRouter);

  const casesRouter = require('./routes/cases');
  app.use('/api/v1/suites/:suiteId/cases', casesRouter);
  app.use('/api/v1/cases', casesRouter);

  const runsRouter = require('./routes/runs');
  app.use('/api/v1/projects/:projectId/runs', runsRouter);
  app.use('/api/v1/runs', runsRouter);

  app.use('/api/v1/runs', require('./routes/export'));

  app.get('/api/v1/health', (_req, res) => {
    const cfg = getDbConfig();
    const connected = isConnected();
    res.json({
      status: connected ? 'ok' : 'db_disconnected',
      dbHost: `${cfg.host}:${cfg.port}`,
      dbName: cfg.database,
      dbConnected: connected,
      version,
    });
  });

  app.use('/api/v1', require('./routes/backup'));
  app.use('/api/v1/search', require('./routes/search'));
  app.use('/api/v1/jira', require('./routes/jira'));
  app.use('/api/v1', require('./routes/stats'));
  app.use('/api/v1/db', require('./routes/dbconfig'));
  app.use('/api/v1/admin', require('./routes/admin'));
  app.use('/api/v1/admin', require('./routes/logs'));
  app.use('/api/v1/settings/layout', layoutSettings.router);

  const attachmentsRouter = require('./routes/attachments');
  app.use('/api/v1/run-cases/:runCaseId/attachments', attachmentsRouter);
  app.use('/api/v1/attachments', attachmentsRouter);

  // Restart
  app.post('/api/v1/admin/restart', (_req, res) => {
    res.json({ ok: true, message: 'Server restarting…' });
    setTimeout(() => {
      const child = spawn(process.argv[0], process.argv.slice(1), {
        detached: true,
        stdio: 'inherit',
        env: process.env,
      });
      child.unref();
      process.exit(0);
    }, 300);
  });

  // Spec download
  const specPath = path.join(__dirname, '..', 'story-map.json');
  app.get('/api/v1/spec', (_req, res) => {
    if (!fs.existsSync(specPath)) return res.status(404).json({ error: 'Spec file not found', code: 'NOT_FOUND' });
    res.setHeader('Content-Disposition', 'attachment; filename="ltcm-story-map.json"');
    res.setHeader('Content-Type', 'application/json');
    res.sendFile(specPath);
  });

  // Serve built frontend (production only — not when running alongside Vite dev server)
  if (process.env.NODE_ENV === 'production') {
    const clientDist = path.join(__dirname, '..', 'client', 'dist');
    if (fs.existsSync(clientDist)) {
      app.use(express.static(clientDist));
      app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
    }
  }

  startLogCleanup();
  return app;
}

module.exports = { createApp };
