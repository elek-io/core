import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.node.ts'],
    format: ['esm'],
    platform: 'node',
    outDir: 'dist/node',
    minify: false,
    dts: true,
    sourcemap: true,
    clean: true,
  },
  {
    entry: ['src/index.browser.ts'],
    format: ['esm'],
    platform: 'browser',
    outDir: 'dist/browser',
    minify: true,
    dts: true,
    sourcemap: true,
    clean: true,
  },
  {
    entry: ['src/index.cli.ts'],
    format: ['esm'],
    platform: 'node',
    outDir: 'dist/cli',
    minify: false,
    dts: true,
    sourcemap: true,
    clean: true,
    external: ['@elek-io/core'],
  },
]);
