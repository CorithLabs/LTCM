const fs = require('fs');
const path = require('path');
const os = require('os');

const LOG_DIR = path.join(__dirname, '..', 'data', 'logs');
fs.mkdirSync(LOG_DIR, { recursive: true });

const APP_LOG    = path.join(LOG_DIR, 'app.log');
const ACCESS_LOG = path.join(LOG_DIR, 'access.log');
const HOSTNAME   = os.hostname();
const PID        = process.pid;

function ts() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function append(file, line) {
  try { fs.appendFileSync(file, line + '\n'); } catch { /* never crash the app */ }
}

// Intercept console methods so all existing log calls flow into app.log
const _log  = console.log.bind(console);
const _err  = console.error.bind(console);
const _warn = console.warn.bind(console);

console.log = (...a) => {
  _log(...a);
  append(APP_LOG, `${ts()} ${HOSTNAME} ltcm[${PID}]: INFO ${a.join(' ')}`);
};
console.error = (...a) => {
  _err(...a);
  append(APP_LOG, `${ts()} ${HOSTNAME} ltcm[${PID}]: ERROR ${a.join(' ')}`);
};
console.warn = (...a) => {
  _warn(...a);
  append(APP_LOG, `${ts()} ${HOSTNAME} ltcm[${PID}]: WARN ${a.join(' ')}`);
};

function logAccess(ip, username, method, reqPath) {
  append(ACCESS_LOG, `${ts()} ${ip} ${username || 'unknown'} ${method} ${reqPath}`);
}

function pruneOlderThan24h(file) {
  try {
    if (!fs.existsSync(file)) return;
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
    const kept = lines.filter(line => {
      const m = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)/);
      return m ? new Date(m[1]).getTime() >= cutoff : false;
    });
    fs.writeFileSync(file, kept.length ? kept.join('\n') + '\n' : '');
  } catch { /* silently skip */ }
}

function startLogCleanup() {
  pruneOlderThan24h(APP_LOG);
  pruneOlderThan24h(ACCESS_LOG);
  setInterval(() => {
    pruneOlderThan24h(APP_LOG);
    pruneOlderThan24h(ACCESS_LOG);
  }, 60 * 60 * 1000);
}

function readLastLines(file, n = 200) {
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  return lines.slice(-n).reverse();
}

module.exports = { logAccess, startLogCleanup, readLastLines, APP_LOG, ACCESS_LOG };
