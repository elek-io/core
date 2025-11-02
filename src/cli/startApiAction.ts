import type { ApiStartProps } from '../schema/cliSchema.js';
import { core } from './index.js';

export const startApiAction = ({ port }: ApiStartProps) => {
  return core.api.start(port);
};
