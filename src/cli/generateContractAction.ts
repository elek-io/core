import Fs from 'fs-extra';
import Path from 'node:path';
import {
  contractSchema,
  CONTRACT_FILE_NAME,
  type ContractFromProjectProps,
  type GenerateContractProps,
} from '../schema/index.js';
import { CoreError } from '../util/shared.js';
import { getCore } from './util.js';

/**
 * Writes a Project's Collections and Components to `elek.contract.json`, so
 * a theme states what it needs without anyone writing the file by hand.
 *
 * Run it again after the Project changed and the Contract follows, keeping
 * the name and the version the file already carries unless new ones are
 * given. The first run has no file to read them from, so it needs both.
 * Throws on failure, the binary entry presents the error.
 */
export const generateContractAction = async ({
  project,
  outDir,
  name,
  version,
  languages,
}: GenerateContractProps) => {
  const core = getCore();
  const resolvedOutDir = Path.resolve(outDir);
  const filePath = Path.join(resolvedOutDir, CONTRACT_FILE_NAME);
  const previous = await readPrevious(filePath);

  const resolvedName = name ?? previous?.name;
  const resolvedVersion = version ?? previous?.version;
  if (resolvedName === undefined || resolvedVersion === undefined) {
    throw CoreError.badRequest(
      `No ${CONTRACT_FILE_NAME} at "${filePath}" to take a name and a version from, so both have to be given. Pass --name and --contract-version.`
    );
  }

  const props: ContractFromProjectProps = {
    projectId: project,
    name: resolvedName,
    version: resolvedVersion,
    ...(languages === undefined ? {} : { languages }),
  };
  const contract = await core.contracts.generate(props);

  await Fs.ensureDir(resolvedOutDir);
  await Fs.writeFile(filePath, `${JSON.stringify(contract, null, 2)}\n`);

  // The person at the terminal gets the path they chose, and Core's logger
  // gets the shape of what happened. A log file can be attached to a bug
  // report, so neither the Contract's name nor a path somebody typed goes
  // into it. See contributing/logging.md.
  console.log(`Wrote the Contract to "${filePath}"`);
  core.logger.info({
    source: 'core',
    message: `Wrote the Contract of Project ${project} at version ${contract.version}, with ${contract.collections.length} Collections and ${contract.components.length} Components`,
    meta: {
      'elek.project.id': project,
      'elek.collection.count': contract.collections.length,
    },
  });
};

/**
 * The Contract already at the path, or undefined when there is none, so a
 * rerun keeps the name and the version. A file that is no Contract throws,
 * rather than being overwritten on the strength of a typo in the path.
 */
async function readPrevious(
  filePath: string
): Promise<{ name: string; version: string } | undefined> {
  if ((await Fs.pathExists(filePath)) === false) {
    return undefined;
  }
  const parsed = contractSchema
    .pick({ name: true, version: true })
    .safeParse(await Fs.readJson(filePath).catch(() => undefined));
  if (parsed.success === false) {
    throw CoreError.badRequest(
      `The file at "${filePath}" carries no Contract name and version to keep. Move it aside and run this again, which writes a Contract of its own.`
    );
  }
  return parsed.data;
}
