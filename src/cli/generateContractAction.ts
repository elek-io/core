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
      `No ${CONTRACT_FILE_NAME} at "${filePath}" to take a name and a version from, so both have to be given. Pass --name and --version.`
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

  // The Project id rather than its name. This goes through Core's logger, so
  // it lands in a log file that can be attached to a bug report, and names
  // stay out of those. See contributing/logging.md.
  core.logger.info({
    source: 'core',
    message: `Wrote the Contract "${contract.name}" at version ${contract.version} of Project ${project} to "${filePath}", with ${contract.collections.length} Collections and ${contract.components.length} Components`,
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
      `The file at "${filePath}" carries no Contract name and version to keep. Move it aside, or pass --name and --version to write it again.`
    );
  }
  return parsed.data;
}
