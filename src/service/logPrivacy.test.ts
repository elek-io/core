import Fs from 'fs-extra';
import Path from 'node:path';
import { describe, expect, it } from 'vitest';
import core from '../test/setup.js';
import { createAsset, createCollection, createProject } from '../test/util.js';

/**
 * Core's log files can be attached to a bug report, so they hold ids and
 * paths and never the names a User typed. Names buy nothing a log reader
 * cannot get by resolving the id against the repository, and they are the
 * one part of the file that reads as somebody's words.
 *
 * See contributing/logging.md. The per-leak regression tests live next to
 * the code that leaked: GitService.redaction.test.ts for the git signature,
 * ProjectService.upgradeLogging.test.ts for authored Entry content.
 */
describe('names a User typed stay out of the log files', function () {
  it('does not write a Project name through a whole lifecycle', async function () {
    // A string nothing else in the suite produces, so finding it in a log
    // file can only mean a call site put the name there.
    const sentinel = 'zqx-canary-4d71ae-project';
    const project = await createProject(sentinel);

    const collection = await createCollection(project.id);
    await createAsset(project.id);
    await core.collections.list({ projectId: project.id, limit: 0 });
    await core.entries.list({
      projectId: project.id,
      collectionId: collection.id,
      limit: 0,
    });
    await core.projects.read({ id: project.id });

    expect(await readLogs()).not.toContain(sentinel);
    await project.destroy();
  }, 60000);
});

async function readLogs(): Promise<string> {
  const dir = core.util.pathTo.logs;
  if (!(await Fs.pathExists(dir))) {
    return '';
  }
  const names = await Fs.readdir(dir);
  const contents = await Promise.all(
    names
      .filter((name) => name.endsWith('.log'))
      .map((name) => Fs.readFile(Path.join(dir, name), 'utf8'))
  );
  return contents.join('\n');
}
