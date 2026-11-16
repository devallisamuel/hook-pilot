/** End-to-end tests: require Postgres and Redis (see `npm run infra:up`). */
module.exports = {
  rootDir: '..',
  testEnvironment: 'node',
  testRegex: 'test/e2e/.*\\.e2e-spec\\.ts$',
  transform: { '^.+\\.ts$': 'ts-jest' },
  moduleFileExtensions: ['ts', 'js', 'json'],
  testTimeout: 30000,
};
