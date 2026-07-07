import type { ApiStartProps } from '../schema/cliSchema.js';
import { getCore } from './index.js';

export const startApiAction = ({ port }: ApiStartProps) => {
  return getCore().api.start(port);
};
