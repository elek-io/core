import Fs from 'fs-extra';
import Path from 'node:path';
import type { Contract } from '../schema/index.js';
import { CONTRACT_FILE_NAME } from '../schema/index.js';
import core, { uuid } from './setup.js';
import { execGit } from './util.js';

/** A theme's repository, and what it holds at each version it tagged */
export interface FakeTheme {
  /** The address to read it from, a path to the bare repository */
  url: string;
  /**
   * Commits a file tree and tags it, annotated by default, so a tag object
   * rather than the commit is what the address advertises
   *
   * With `isMoved` it takes a tag that is already there onto the new commit,
   * which is what a theme re-tagging a version it released does.
   */
  release: (props: {
    tag: string;
    files: Record<string, string>;
    isLightweight?: boolean;
    isMoved?: boolean;
  }) => Promise<string>;
}

/**
 * A theme as a local bare repository, which is an address a Project's remote
 * accepts too, so a test reads one without a git host.
 *
 * Nothing is tagged until `release` is called, so a test starts from a theme
 * that has tagged no version. It lives below this test file's own data
 * directory rather than the OS temp directory, so it needs no per-test
 * cleanup and a `beforeAll` can build one, see contributing/testing.md.
 */
export async function createFakeTheme(): Promise<FakeTheme> {
  const themePath = Path.join(core.options.dataDir, 'themes', uuid());
  const workPath = Path.join(themePath, 'work');
  const barePath = Path.join(themePath, 'bare.git');
  await Fs.ensureDir(workPath);
  await execGit(workPath, ['init', '--quiet', '--initial-branch=main', '.']);
  await execGit(workPath, ['config', 'user.name', 'Theme Author']);
  await execGit(workPath, ['config', 'user.email', 'author@theme.test']);
  // An empty repository advertises nothing, so one commit exists from the
  // start and `release` only ever adds to it
  await Fs.writeFile(Path.join(workPath, 'README.md'), 'A theme\n');
  await execGit(workPath, ['add', '--all']);
  await execGit(workPath, ['commit', '--quiet', '--message=Start the theme']);
  await execGit(workPath, ['clone', '--quiet', '--bare', workPath, barePath]);

  return {
    url: barePath,
    release: async ({ tag, files, isLightweight, isMoved }) => {
      for (const [name, content] of Object.entries(files)) {
        await Fs.outputFile(Path.join(workPath, name), content);
      }
      await execGit(workPath, ['add', '--all']);
      await execGit(workPath, [
        'commit',
        '--quiet',
        '--allow-empty',
        `--message=Release ${tag}`,
      ]);
      const force = isMoved === true ? ['--force'] : [];
      await execGit(
        workPath,
        isLightweight === true
          ? ['tag', ...force, tag]
          : ['tag', '--annotate', ...force, tag, `--message=Release ${tag}`]
      );
      await execGit(workPath, [
        'push',
        '--quiet',
        ...force,
        barePath,
        'main',
        '--tags',
      ]);
      return execGit(workPath, ['rev-parse', 'HEAD']);
    },
  };
}

/** A Contract as a theme's repository carries it, ready to be written */
export function contractFileOf(contract: Contract): Record<string, string> {
  return { [CONTRACT_FILE_NAME]: `${JSON.stringify(contract, null, 2)}\n` };
}
