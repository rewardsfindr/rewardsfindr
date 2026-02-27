module.exports = {
  testEnvironment: 'jsdom',
  testMatch: [
    '**/__tests__/**/*.test.js',
    '**/*.test.js',
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/mobile/',
    '/src/tests/', // old test folder — being replaced
  ],
  transform: {
    '^.+\\.jsx?$': 'babel-jest',
  },
  moduleNameMapper: {
    '^../shared/(.*)$': '<rootDir>/src/shared/$1',
    '^./shared/(.*)$': '<rootDir>/src/shared/$1',
  },
  collectCoverageFrom: [
    'src/shared/**/*.js',
    'extension/content/**/*.js',
    'src/App.js',
  ],
  setupFilesAfterFramework: ['@testing-library/jest-dom'],
};
