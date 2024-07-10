import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.node.ts'],
    format: ['esm'],
    platform: 'node',
    outDir: 'dist/node',
    splitting: false,
    dts: true,
    sourcemap: true,
    clean: true,
  },
  {
    entry: ['src/index.browser.ts'],
    format: ['esm'],
    platform: 'browser',
    outDir: 'dist/browser',
    splitting: false,
    dts: true,
    sourcemap: true,
    clean: true,
  },
]);
