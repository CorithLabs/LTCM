/**
 * DB connection config manager.
 * Stores settings in data/db-config.json.
 * DATABASE_URL env var overrides the file.
 */

const fs = require('fs');
const path = require('path');

const CONFIG_DIR = path.join(__dirname, '..', 'data');
const CONFIG_PATH = path.join(CONFIG_DIR, 'db-config.json');

const DEFAULTS = {
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: '',
  database: 'ltcm',
};

function loadDbConfig() {
  // DATABASE_URL env var takes precedence
  if (process.env.DATABASE_URL) {
    try {
      const u = new URL(process.env.DATABASE_URL);
      return {
        host: u.hostname,
        port: parseInt(u.port || '5432', 10),
        user: u.username || DEFAULTS.user,
        password: u.password || DEFAULTS.password,
        database: u.pathname.replace(/^\//, '') || DEFAULTS.database,
      };
    } catch {
      console.warn('  ⚠ Could not parse DATABASE_URL — falling back to db-config.json or defaults');
    }
  }

  if (fs.existsSync(CONFIG_PATH)) {
    try {
      return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) };
    } catch {
      console.warn('  ⚠ Could not read db-config.json — using defaults');
    }
  }

  return { ...DEFAULTS };
}

function saveDbConfig(config) {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  const toSave = {
    host: config.host || DEFAULTS.host,
    port: parseInt(config.port, 10) || DEFAULTS.port,
    user: config.user || DEFAULTS.user,
    password: config.password ?? DEFAULTS.password,
    database: config.database || DEFAULTS.database,
  };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(toSave, null, 2), 'utf8');
  return toSave;
}

function getDbConfig() {
  return loadDbConfig();
}

module.exports = { loadDbConfig, saveDbConfig, getDbConfig, DEFAULTS };
