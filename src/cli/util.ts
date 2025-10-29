import chokidar from 'chokidar';
import ElekIoCore from '../index.node.js';

export const core = new ElekIoCore({
  log: {
    level: 'info',
  },
});

export function watchProjects() {
  return chokidar.watch(core.util.pathTo.projects, {
    ignoreInitial: true, // Do not regenerate Client while chokidar first discovers all directories and files
    ignored: (path) => path.includes('/.git/'), // Exclude all files inside .git directory of Project repositories
  });
}
