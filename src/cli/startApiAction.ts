import { apiStartActionSchema } from '../schema/cliSchema.js';
import { core } from './index.js';

export const startApiAction = apiStartActionSchema.implement((port) => {
  core.api.start(parseInt(port));
});
