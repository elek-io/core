import Fs from 'fs-extra';
import ElekIoCore, { CoreError } from '../index.node.js';

/**
 * Lazily-created, process-wide ElekIoCore. Created on first use so that
 * importing @elek-io/core/astro has no side effects. Configured through
 * the ELEK_IO_* environment variables, which are read once here.
 *
 * The log level is left to ELEK_IO_LOG_LEVEL rather than passed, since
 * an option would win over the variable and there would be no way to
 * quieten Core inside an Astro build.
 *
 * The file cache is off on purpose. Core only invalidates it for writes
 * it performs itself, while here another application owns the files:
 * the Desktop app edits a Project while `astro dev` reads it, and a
 * cached Project would keep serving content one edit behind. Every file
 * is read once per sync either way, so there is nothing to gain.
 *
 * The process error handlers are off because inside a build the host
 * owns the process. Astro has its own handling, and this instance is
 * never disposed, so handlers registered here would outlive every
 * loader and cover a process Core does not own. That is not theory: an
 * Astro build whose stdout pipe closed produced an EPIPE Core then
 * caught, logged, and turned back into an EPIPE, 5450 times a second
 * for 13 minutes. See contributing/logging.md.
 */
let coreInstance: ElekIoCore | undefined;
export function getCore(): ElekIoCore {
  if (!coreInstance) {
    coreInstance = new ElekIoCore({
      file: { cache: false },
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
 * Logs which content state a loader is about to read, so every build
 * states its source and ref
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
