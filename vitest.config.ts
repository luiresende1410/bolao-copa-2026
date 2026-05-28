import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/server.ts', 'src/**/*.d.ts'],
    },
  },
  resolve: {
    alias: {
      '@api': path.resolve(__dirname, 'src/api'),
      '@webhook': path.resolve(__dirname, 'src/webhook'),
      '@worker': path.resolve(__dirname, 'src/worker'),
      '@domain': path.resolve(__dirname, 'src/domain'),
      '@infra': path.resolve(__dirname, 'src/infra'),
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
});
