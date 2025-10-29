import { apiStartActionSchema } from '../schema/cliSchema.js';
import { core } from './index.js';

export const startApiAction = apiStartActionSchema.implementAsync(
  async (port) => {
    await core.api.start(port);
  }
);
