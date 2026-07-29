import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/v05/**/*.test.ts'],
    coverage: {
      include: ['src/**/*.ts'],
      exclude: ['src/cli/**'],
      thresholds: {
        branches: 60,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  },
});
