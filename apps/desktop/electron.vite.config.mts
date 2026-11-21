import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Workspace packages ship TypeScript source, so bundle them instead of externalising.
const bundleWorkspace = { externalizeDeps: { exclude: ['@sayso/helper-protocol', '@sayso/command-grammar'] } };

export default defineConfig({
  main: { build: bundleWorkspace },
  preload: { build: bundleWorkspace },
  renderer: {
    root: resolve(import.meta.dirname, 'src/renderer'),
    build: { rollupOptions: { input: resolve(import.meta.dirname, 'src/renderer/index.html') } },
    plugins: [react(), tailwindcss()],
  },
});
