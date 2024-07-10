import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.node.ts'],
    format: ['esm'],
    platform: 'node',
    outDir: 'dist/node',
    dts: true,
    sourcemap: true,
    clean: true,
  },
  {
    entry: ['src/index.browser.ts'],
    format: ['esm'],
    platform: 'browser',
    outDir: 'dist/browser',
    dts: true,
    sourcemap: true,
    clean: true,
  },
]);
