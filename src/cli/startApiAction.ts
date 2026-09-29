import type { ApiStartProps } from '../schema/cliSchema.js';
import { getCore } from './index.js';

/**
 * Starts Core's read-only local REST API on `port` and resolves once it is
 * listening. The listening server keeps the Node process alive, so
 * `elek api:start` runs until it is killed and nothing here stops it.
 *
 * A busy port rejects with a `Conflict` `CoreError`, which the CLI prints
 * like any other failure.
 *
 * @see ../../docs/local-api.md
 */
export const startApiAction = ({ port }: ApiStartProps) => {
  return getCore().api.start(port);
};
