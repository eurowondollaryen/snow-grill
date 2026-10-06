import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  server: { port: 5173, host: true },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: { manualChunks: { three: ['three'] } },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
