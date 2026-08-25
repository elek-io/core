import type { ProvisionProps } from '../schema/index.js';
import { resolveContentRef } from '../util/node.js';
import { getCore } from './util.js';

/**
 * Provisions a copy of a Project from its remote into the data
 * directory
 *
 * The ref precedence is the ELEK_IO_CHANNEL environment variable
 * over the given ref over `production`. Runs on a read-only Core, so
 * no User is required. Throws on failure, the binary entry presents
 * the error.
 */
export const provisionAction = async ({
  project,
  url,
  ref,
}: ProvisionProps) => {
  const core = getCore();
  const resolvedRef = resolveContentRef(ref);
  // A fallback warning is already logged by Core itself, which shares
  // this logger, so it is part of the command output
  const result = await core.projects.provision({
    id: project,
    url,
    ref: resolvedRef,
  });

  // The Project id rather than its name. This goes through Core's logger,
  // so it lands in a log file that can be attached to a bug report, and
  // names stay out of those. See contributing/logging.md.
  core.logger.info({
    source: 'core',
    message: `Provisioned Project ${result.project.id} at "${resolvedRef}", version ${result.project.version} (${result.source})`,
  });
};
