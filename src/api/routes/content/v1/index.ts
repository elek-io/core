import { createRouter } from '../../../lib/util.js';
import projectRoutes from './projects.js';
import collectionRoutes from './collections.js';
import componentRoutes from './components.js';
import entryRoutes from './entries.js';
import assetRoutes from './assets.js';

const router = createRouter()
  .route('/projects', projectRoutes)
  .route('/projects', collectionRoutes)
  .route('/projects', componentRoutes)
  .route('/projects', entryRoutes)
  .route('/projects', assetRoutes);

export default router;
