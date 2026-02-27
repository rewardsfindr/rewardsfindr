module.exports = {
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.[jt]sx?$': 'babel-jest',
  },
  setupFilesAfterEnv: ['@testing-library/jest-dom'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/mobile/',
    '/src/tests/',
  ],
  testMatch: [
    '**/__tests__/**/*.test.js',
    '**/*.test.js',
  ],
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': '<rootDir>/src/__mocks__/fileMock.js',
  },
};
