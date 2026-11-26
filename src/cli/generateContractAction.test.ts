import Fs from 'fs-extra';
import Path from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { contractSchema, CONTRACT_FILE_NAME } from '../schema/index.js';
import core, { CoreError, uuid, type Collection } from '../test/setup.js';
import {
  createCollection,
  createComponent,
  createProject,
  createRefCollection,
  expectCoreError,
} from '../test/util.js';
import { generateContractAction } from './generateContractAction.js';
import { getCore } from './util.js';

/**
 * Exercises generateContractAction in process. The CLI Core of this worker
 * resolves its data directory from the worker's ELEK_IO_DATA_DIR, so the
 * shared test Core's Projects are the ones it reads. Error presentation and
 * the exit code live in the binary entry, covered by index.cli.test.ts.
 */
describe('generateContractAction', function () {
  let projectId = '';
  let collection: Collection;
  let outDir = '';

  beforeAll(async function () {
    getCore();
    const project = await createProject();
    projectId = project.id;
    collection = await createCollection(projectId);
    await createComponent(projectId);
    outDir = Path.join(core.options.dataDir, 'theme');
    await Fs.ensureDir(outDir);
  });

  /** The Contract the command wrote, parsed as a consumer would read it */
  async function written(directory = outDir) {
    return contractSchema.parse(
      await Fs.readJson(Path.join(directory, CONTRACT_FILE_NAME))
    );
  }

  it('writes the Contract of a Project under the given name and version', async function () {
    await generateContractAction({
      project: projectId,
      outDir,
      name: '@acme/dealer-site',
      version: '1.0.0',
    });

    const contract = await written();
    expect(contract.name).toEqual('@acme/dealer-site');
    expect(contract.version).toEqual('1.0.0');
    expect(contract.collections.map(({ id }) => id)).toEqual([collection.id]);
    expect(contract.components).toHaveLength(1);
    expect(contract.languages).toEqual(['en', 'de']);
  });

  it('creates the directory it writes into', async function () {
    const fresh = Path.join(core.options.dataDir, 'fresh-theme');

    await generateContractAction({
      project: projectId,
      outDir: fresh,
      name: '@acme/fresh-site',
      version: '1.0.0',
    });

    expect((await written(fresh)).name).toEqual('@acme/fresh-site');
  });

  it('keeps the name and the version of the Contract already there', async function () {
    await generateImpliedRerun();

    const contract = await written();
    expect(contract.name).toEqual('@acme/dealer-site');
    expect(contract.version).toEqual('1.0.0');
  });

  it('follows the Project when it is run again', async function () {
    const added = await createRefCollection(projectId);

    await generateImpliedRerun();

    expect(
      (await written()).collections.map(({ id }) => id).toSorted()
    ).toEqual([collection.id, added.id].toSorted());

    await core.collections.delete({ projectId, id: added.id });
  });

  it('takes a new name and a new version over the ones already there', async function () {
    await generateContractAction({
      project: projectId,
      outDir,
      name: '@acme/renamed-site',
      version: '2.0.0',
    });

    const contract = await written();
    expect(contract.name).toEqual('@acme/renamed-site');
    expect(contract.version).toEqual('2.0.0');

    await generateContractAction({
      project: projectId,
      outDir,
      name: '@acme/dealer-site',
      version: '1.0.0',
    });
  });

  it('takes a new version alone and keeps the name', async function () {
    await generateContractAction({
      project: projectId,
      outDir,
      version: '1.1.0',
    });

    const contract = await written();
    expect(contract.name).toEqual('@acme/dealer-site');
    expect(contract.version).toEqual('1.1.0');

    await generateContractAction({
      project: projectId,
      outDir,
      version: '1.0.0',
    });
  });

  it("writes the languages it is given instead of the Project's", async function () {
    const anyLanguage = Path.join(core.options.dataDir, 'any-theme');

    await generateContractAction({
      project: projectId,
      outDir: anyLanguage,
      name: '@acme/any-site',
      version: '1.0.0',
      languages: 'any',
    });

    expect((await written(anyLanguage)).languages).toEqual('any');
  });

  it('needs both a name and a version on a first run', async function () {
    const first = Path.join(core.options.dataDir, 'first-theme');

    // The option the command registers, not `--version`, which answers with
    // the CLI's own version and writes nothing
    await expectCoreError(
      generateContractAction({
        project: projectId,
        outDir: first,
        version: '1.0.0',
      }),
      'BadRequest',
      'Pass --name and --contract-version.'
    );
    await expectCoreError(
      generateContractAction({
        project: projectId,
        outDir: first,
        name: '@acme/first-site',
      }),
      'BadRequest',
      'Pass --name and --contract-version.'
    );

    expect(await Fs.pathExists(Path.join(first, CONTRACT_FILE_NAME))).toEqual(
      false
    );
  });

  it('refuses to overwrite a file that is no Contract', async function () {
    const foreign = Path.join(core.options.dataDir, 'foreign-theme');
    await Fs.outputFile(
      Path.join(foreign, CONTRACT_FILE_NAME),
      '{ "something": "else" }'
    );

    const error = await generateContractAction({
      project: projectId,
      outDir: foreign,
    }).then(
      () => undefined,
      (caught: unknown) => caught
    );

    expect(error).toBeInstanceOf(CoreError);
    expect(error instanceof CoreError && error.message).toContain(
      'carries no Contract name and version to keep'
    );
    // Passing the two options does not get past this, because the file is
    // read before they are, so the message does not offer them
    expect(error instanceof CoreError && error.message).not.toContain('--name');
    expect(
      await Fs.readFile(Path.join(foreign, CONTRACT_FILE_NAME), 'utf8')
    ).toEqual('{ "something": "else" }');
    await expectCoreError(
      generateContractAction({
        project: projectId,
        outDir: foreign,
        name: '@acme/foreign-site',
        version: '1.0.0',
      }),
      'BadRequest',
      'carries no Contract name and version to keep'
    );
  });

  it("writes the path to the terminal and keeps it out of Core's log", async function () {
    const logged = vi.spyOn(getCore().logger, 'info');
    const printed = vi
      .spyOn(console, 'log')
      .mockImplementation(() => undefined);
    let terminal = '';
    let logFile = '';

    try {
      await generateContractAction({
        project: projectId,
        outDir,
        name: '@acme/dealer-site',
        version: '1.0.0',
      });
    } finally {
      // Read before restoring, which drops what the spy recorded
      terminal = JSON.stringify(printed.mock.calls);
      logFile = JSON.stringify(logged.mock.calls);
      printed.mockRestore();
      logged.mockRestore();
    }

    expect(terminal).toContain(CONTRACT_FILE_NAME);
    expect(logFile).toContain(projectId);
    expect(logFile).not.toContain('@acme/dealer-site');
    expect(logFile).not.toContain(outDir);
  });

  it('refuses a Project it cannot read, leaving the Contract as it was', async function () {
    const before = await Fs.readFile(
      Path.join(outDir, CONTRACT_FILE_NAME),
      'utf8'
    );

    await expectCoreError(
      generateContractAction({
        project: uuid(),
        outDir,
        name: '@acme/dealer-site',
        version: '1.0.0',
      }),
      'NotFound'
    );

    expect(
      await Fs.readFile(Path.join(outDir, CONTRACT_FILE_NAME), 'utf8')
    ).toEqual(before);
  });

  /** A rerun the way the command runs it with neither option given */
  async function generateImpliedRerun() {
    await generateContractAction({ project: projectId, outDir });
  }
});
