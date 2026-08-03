import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@src': resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    retry: 1,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'lcov', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        'webchat/',
      ],
      // Coverage regression gate: the backend suite must not drop below these
      // levels. Calibrated to current coverage (Aug 2026) minus a small margin.
      // The webchat/ frontend has no unit tests (0%) and is tracked as a
      // separate future request — excluded here so it does not distort the gate.
      thresholds: {
        statements: 80,
        lines: 80,
        functions: 80,
        branches: 72,
      },
    },
  },
});
