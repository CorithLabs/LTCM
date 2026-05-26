require('dotenv').config({ path: '.env.local' });
require('./src/logger'); // intercepts console.* for app.log — must load first
const { initDb } = require('./src/db');
const { createApp } = require('./src/app');
const { seedAdminUser } = require('./src/startup');
const { version } = require('./package.json');

const PORT = process.env.PORT || 3000;

console.log('\n  🧪 LTCM — Lightweight Test Case Manager');
console.log(`  v${version}\n`);

(async () => {
  await initDb();
  await seedAdminUser();
  const app = createApp();
  const server = app.listen(PORT, () => {
    console.log(`\n  ✅ Running at http://localhost:${PORT}\n`);
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n  ❌ Port ${PORT} is already in use. Stop the existing server first.\n`);
    } else {
      console.error(`\n  ❌ Server error: ${err.message}\n`);
    }
    process.exit(1);
  });
})();
