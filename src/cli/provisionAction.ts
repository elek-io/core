import type { ProvisionProps } from '../schema/index.js';
import { resolveContentRef } from '../util/node.js';
import { CoreError } from '../util/shared.js';
import { getCore } from './util.js';

/**
 * Provisions a copy of a Project from its remote into the data
 * directory
 *
 * The ref precedence is the ELEK_IO_CHANNEL environment variable
 * over the given ref over `production`. Runs on a read-only Core, so
 * no User is required.
 */
export const provisionAction = async ({
  project,
  url,
  ref,
}: ProvisionProps) => {
  try {
    const core = getCore();
    const resolvedRef = resolveContentRef(ref);
    const provisioned = await core.projects.provision({
      id: project,
      url,
      ref: resolvedRef,
    });

    core.logger.info({
      source: 'core',
      message: `Provisioned Project "${provisioned.name}" (${provisioned.id}) at "${resolvedRef}", version ${provisioned.version}`,
    });
  } catch (error) {
    console.error(error instanceof CoreError ? error.message : String(error));
    process.exit(1);
  }
};
