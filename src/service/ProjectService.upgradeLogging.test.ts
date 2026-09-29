import Fs from 'fs-extra';
import Path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import core from '../test/setup.js';
import {
  createAsset,
  createCollection,
  createEntry,
  createProject,
} from '../test/util.js';

/**
 * Upgrading a Project used to log the whole entity file before and after,
 * at `info`, which is the level a packaged elek.io Desktop runs at. An
 * Entry file carries every authored Value in every language, so a User who
 * had upgraded had their content sitting in a log file that the report
 * dialog offers to send while telling them it holds none.
 *
 * The invariant is in contributing/logging.md: Core's log files never
 * contain authored content.
 */
describe('upgrading a Project does not log what the User wrote', function () {
  const secret = 'zqx-canary-8f2b1c-unpublished-draft';
  let projectId = '';
  let destroy: () => Promise<void>;

  beforeAll(async function () {
    const project = await createProject();
    projectId = project.id;
    destroy = project.destroy;
    const collection = await createCollection(projectId);
    const asset = await createAsset(projectId);
    const entry = await createEntry(projectId, collection.id, asset.id);

    // Put a string nothing else in the suite produces into a Value, so
    // finding it in a log file can only mean the content path leaked it.
    const values = { ...entry.values };
    for (const [slug, value] of Object.entries(values)) {
      if (value.valueType === 'string') {
        values[slug] = { ...value, content: { en: secret, de: secret } };
        break;
      }
    }
    await core.entries.update({
      projectId,
      collectionId: collection.id,
      id: entry.id,
      values,
    });
  }, 60000);

  it('keeps authored content out of the log file', async function () {
    // `force` runs the whole upgrade path over every entity even though the
    // Project already carries this Core version, which is what puts the
    // Entry file through the site that used to log its body.
    await core.projects.upgrade({ id: projectId, force: true });

    expect(await readLogs()).not.toContain(secret);
    await destroy();
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
