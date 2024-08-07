import type { ProjectUpgrade } from '../schema/projectSchema.js';

export type ProjectUpgradeImport = typeof import('./example.js');

/**
 * This is an example implementation of a upgrade file
 */
const upgrade: ProjectUpgrade = {
  to: '0.0.0',
  run: async (project) => {
    // Do something with the Project
    console.log(project);
  },
};

export default upgrade;
