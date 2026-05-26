module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/integration/**/*.test.js'],
  testTimeout: 15000,
  // Each file runs in its own worker — required for DB singleton isolation
  maxWorkers: 1,
};
