import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: {
    watch: {
      ignored: ['**/.worktrees/**'],
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
