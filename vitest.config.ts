import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    exclude: ['node_modules', '.next', 'dist'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/web'),
      '@/server': path.resolve(__dirname, './src/server'),
      '@/lib': path.resolve(__dirname, './src/web/lib'),
    },
  },
});

