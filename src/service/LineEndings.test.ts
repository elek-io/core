import { exec as gitExec } from 'dugite';
import Fs from 'fs-extra';
import Path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import core, { type Project } from '../test/setup.js';
import { createAsset, createProject } from '../test/util.js';

/**
 * Core is the only writer inside a Project folder, so the bytes it produces
 * have to be identical on every OS. Line endings are the one place where that
 * is easy to get wrong, since `Os.EOL` and git's `core.autocrlf` both differ
 * per platform. A Project written with CRLF on Windows and rewritten with LF
 * elsewhere would conflict on every line of every file.
 */
describe('Line endings', function () {
  let project: Project & { destroy: () => Promise<void> };
  let projectPath: string;

  beforeAll(async function () {
    project = await createProject();
    await createAsset(project.id);
    projectPath = core.util.pathTo.project(project.id);
  });

  afterAll(async function () {
    await project.destroy();
  });

  // Only fails on Windows, where `Os.EOL` is CRLF. The windows leg of the CI
  // matrix is what makes this assertion worth having.
  it('writes the generated dotfiles without CRLF on any OS', async function () {
    for (const file of ['.gitignore', '.gitattributes']) {
      const content = await Fs.readFile(Path.join(projectPath, file), 'utf8');

      expect(content, `${file} contains CRLF`).not.toContain('\r\n');
    }
  });

  it('declares LF checkout in .gitattributes before the LFS rules', async function () {
    const gitattributes = await Fs.readFile(
      Path.join(projectPath, '.gitattributes'),
      'utf8'
    );
    const lines = gitattributes.split('\n').filter((line) => line.trim());

    // Last matching pattern wins, so the catch-all has to come first or it
    // would strip the `-text` marker off the LFS tracked binaries
    expect(lines[0]).toBe('* text=auto eol=lf');
    expect(gitattributes).toContain(
      'lfs/** filter=lfs diff=lfs merge=lfs -text'
    );
  });

  it('stores every tracked text file as LF in the git index', async function () {
    const result = await gitExec(['ls-files', '--eol'], projectPath);
    const entries = result.stdout
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => {
        const [indexEol, , , path] = line.split(/\s+/);
        return { indexEol, path };
      });

    expect(entries.length).toBeGreaterThan(0);

    const crlf = entries.filter((entry) => entry.indexEol === 'i/crlf');
    expect(crlf, 'files committed with CRLF').toEqual([]);
  });

  it('keeps LFS tracked Assets out of line ending conversion', async function () {
    const result = await gitExec(
      ['check-attr', 'text', 'filter', '--', 'lfs/anything.png'],
      projectPath
    );

    expect(result.stdout).toContain('text: unset');
    expect(result.stdout).toContain('filter: lfs');
  });
});
