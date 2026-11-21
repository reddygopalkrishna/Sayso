import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The UI tests render components to static HTML (no browser needed). Vite 8 transforms with Oxc.
  oxc: { jsx: { runtime: 'automatic' } },
  test: { include: ['src/**/*.test.{ts,tsx}'], environment: 'node' },
});
