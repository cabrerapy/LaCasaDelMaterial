import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    preserveSymlinks: true
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/test-setup.ts'],
    include: ['src/**/*.spec.ts']
  }
});
