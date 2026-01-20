import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/test/e2e/**', // Exclude E2E tests (they use WebdriverIO/Mocha)
    ],
  },
  resolve: {
    alias: {
      'obsidian': path.resolve(__dirname, 'test/__mocks__/obsidian.ts'),
      'leaflet': path.resolve(__dirname, 'test/__mocks__/leaflet.ts'),
    },
  },
});
