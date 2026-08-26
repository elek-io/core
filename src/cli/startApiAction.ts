import type { ApiStartProps } from '../schema/cliSchema.js';
import { getCore } from './index.js';

/**
 * Starts Core's read-only local REST API on `port` and returns synchronously,
 * before the server is listening. The listening server keeps the Node process
 * alive, so `elek api:start` runs until it is killed and nothing here stops
 * it.
 *
 * A second call replaces the tracked server without closing the first, and a
 * busy port arrives as an uncaught server `error` event rather than as a
 * thrown `CoreError`.
 *
 * @see ../../docs/local-api.md
 */
export const startApiAction = ({ port }: ApiStartProps) => {
  return getCore().api.start(port);
};
