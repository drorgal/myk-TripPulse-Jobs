import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@trippulse/shared$': '<rootDir>/../../shared/src/index.ts',
    '^@trippulse/db$': '<rootDir>/../../db/src/index.ts',
  },
};

export default config;
