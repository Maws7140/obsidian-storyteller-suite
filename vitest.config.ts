import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: {
      'obsidian': path.resolve(__dirname, 'test/__mocks__/obsidian.ts'),
    },
  },
});
