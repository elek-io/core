import Fs from 'fs-extra';
import Path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CoreError } from '../../util/shared.js';

/**
 * The path the reference page loads Scalar's bundle from. Core serves it
 * itself, so the page reaches no host but the one it came from.
 *
 * @see ../../../contributing/api-reference.md
 */
export const scalarBundleRoute = '/reference/scalar.js';

/**
 * What the bundle is served as. `text/javascript` is the type the HTML
 * standard asks a server to send for JavaScript.
 */
export const scalarBundleMediaType = 'text/javascript; charset=utf-8';

/**
 * Where the bundle sits on disk, in the order it is looked for, given the
 * directory the calling module runs from.
 *
 * Every built entry is bundled into `dist/<entry>/`, and the node, astro and
 * cli entries each carry this code, so the published candidate is reached
 * from the package root rather than from one entry's own directory. The
 * build copies the bundle into `dist/node` alone, which `files` ships.
 *
 * The second candidate is the pinned devDependency the build copies from,
 * which is what a run from `src/api/lib/` has instead of a `dist`.
 */
export function scalarBundleCandidates(moduleDir: string): string[] {
  return [
    Path.join(moduleDir, '..', '..', 'dist', 'node', 'reference', 'scalar.js'),
    Path.join(
      moduleDir,
      '..',
      '..',
      '..',
      'node_modules',
      '@scalar',
      'api-reference',
      'dist',
      'browser',
      'standalone.js'
    ),
  ];
}

/** The directory this module runs from, which decides the candidates above. */
const thisModuleDir = Path.dirname(fileURLToPath(import.meta.url));

/**
 * Reads Scalar's bundle off disk, looking from `moduleDir`, which defaults to
 * the directory this module itself runs from.
 *
 * Rejects with an `Internal` `CoreError` naming every path it looked in,
 * which is what a build that did not copy the bundle in looks like.
 */
export async function readScalarBundle(
  moduleDir: string = thisModuleDir
): Promise<string> {
  const candidates = scalarBundleCandidates(moduleDir);

  for (const candidate of candidates) {
    if (await Fs.pathExists(candidate)) {
      return Fs.readFile(candidate, 'utf8');
    }
  }

  throw CoreError.internal(
    `Scalar's bundle was not found, looked in ${candidates.join(' and ')}`
  );
}
