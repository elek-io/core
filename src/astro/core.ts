import Fs from 'fs-extra';
import ElekIoCore, { CoreError } from '../index.node.js';

let coreInstance: ElekIoCore | undefined;

/**
 * The process-wide ElekIoCore, created on first call so importing the astro
 * entry has no side effect. Every later call returns that same instance,
 * configured from the ELEK_IO_* variables read once at construction.
 *
 * Caching and the process error handlers are off on purpose, and the
 * log level is left to ELEK_IO_LOG_LEVEL. Nothing disposes it, so a caller
 * must not call `dispose()` on what it hands back.
 *
 * @see ../../contributing/astro-entry.md
 * @see ../../contributing/logging.md
 */
export function getCore(): ElekIoCore {
  if (!coreInstance) {
    coreInstance = new ElekIoCore({
      cache: false,
      log: { hasProcessErrorHandlers: false },
    });
  }
  return coreInstance;
}

/**
 * Throws a typed, actionable error when the Project is not in the
 * data directory, which on a CI runner usually means the elek()
 * integration is missing from astro.config
 */
export async function ensureProjectAvailable(
  core: ElekIoCore,
  alias: string,
  projectId: string
): Promise<void> {
  if (await Fs.pathExists(core.util.pathTo.project(projectId))) {
    return;
  }
  throw CoreError.notFound(
    `Project "${alias}" (${projectId}) was not found in the data directory "${core.options.dataDir}". Add the elek() integration to astro.config to provision it from its remote, or point ELEK_IO_DATA_DIR at the directory holding the Project. See the provisioning guide in the docs of @elek-io/core.`
  );
}

/**
 * Logs what a loader is about to read, so a build states its content state
 * rather than leaving it to be guessed from the output.
 *
 * The line carries the Project's name and version, the data directory, and a
 * source label: `draft` on the `work` branch, the branch name on any other,
 * and the literal `Release tag` when HEAD is detached.
 */
export async function logReadingProject(
  core: ElekIoCore,
  projectId: string,
  log: (message: string) => void
): Promise<void> {
  const project = await core.projects.read({ id: projectId });
  const branch = await core.projects.branches.current({ id: projectId });
  const source = branch === 'work' ? 'draft' : branch || 'Release tag';
  log(
    `Reading Project "${project.name}" version ${project.version} (${source}) from "${core.options.dataDir}"`
  );
}
