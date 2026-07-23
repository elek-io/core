import type { PullProps } from '../schema/index.js';
import { resolveContentRef } from '../util/node.js';
import { CoreError } from '../util/shared.js';
import { getCore } from './util.js';

/**
 * Provisions a Project from its remote into the data directory
 *
 * The ref precedence is ELEK_IO_REF over the given ref over
 * `production`. Runs on a read-only Core, so no User is required.
 */
export const pullAction = async ({ project, url, ref }: PullProps) => {
  try {
    const core = getCore();
    const resolvedRef = resolveContentRef(ref);
    const ensured = await core.projects.ensureFromRemote({
      id: project,
      url,
      ref: resolvedRef,
    });

    core.logger.info({
      source: 'core',
      message: `Provisioned Project "${ensured.name}" (${ensured.id}) at "${resolvedRef}", version ${ensured.version}`,
    });
  } catch (error) {
    console.error(error instanceof CoreError ? error.message : String(error));
    process.exit(1);
  }
};
