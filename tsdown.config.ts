import { defineConfig } from 'tsdown';

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
    deps: { neverBundle: ['dugite', /^node:/] },
    // The local API's reference page loads its bundle from Core rather than
    // from a CDN, so the bundle of the pinned @scalar/api-reference
    // devDependency ships next to the code that serves it, with the notice of
    // the license it carries. `files` ships dist/node, so both are published.
    // See contributing/api-reference.md
    copy: [
      {
        from: 'node_modules/@scalar/api-reference/dist/browser/standalone.js',
        to: 'dist/node/reference',
        rename: 'scalar.js',
      },
      {
        from: 'src/api/lib/scalar-license.txt',
        to: 'dist/node/reference',
        rename: 'scalar-license.txt',
      },
    ],
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
    deps: { neverBundle: [/^node:/] },
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
    deps: { neverBundle: ['@elek-io/core', /^node:/] },
  },
  {
    entry: ['src/index.astro.ts'],
    format: ['esm'],
    platform: 'node',
    outDir: 'dist/astro',
    minify: false,
    dts: true,
    sourcemap: true,
    clean: true,
    deps: { neverBundle: ['astro/loaders', 'dugite', /^node:/] },
  },
]);
