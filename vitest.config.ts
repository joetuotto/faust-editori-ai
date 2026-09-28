import { defineConfig } from 'vitest/config';

// Tests for the FAUST 3 app (app/). The legacy app's tests run with Jest.
export default defineConfig({
  test: {
    include: ['app/**/*.test.ts', 'app/**/*.test.tsx'],
    environment: 'node'
  }
});
