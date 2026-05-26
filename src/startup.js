const bcrypt = require('bcrypt');
const { query, queryOne, newId } = require('./db');

async function seedAdminUser() {
  try {
    const existing = await queryOne('SELECT id FROM users LIMIT 1');
    if (existing) return;

    const hash = await bcrypt.hash('admin', 12);
    await query(
      `INSERT INTO users (id, username, email, password_hash, role, must_change_password)
       VALUES ($1, 'admin', NULL, $2, 'admin', TRUE)`,
      [newId(), hash]
    );
    console.log('  ✓ Default admin user created (username: admin, password: admin)');
    console.log('  ⚠ Change the admin password on first login.');
  } catch (err) {
    // Table may not exist yet if migration hasn't run — silently skip
    if (err.code !== '42P01') {
      console.error('  ✗ Could not seed admin user:', err.message);
    }
  }
}

module.exports = { seedAdminUser };