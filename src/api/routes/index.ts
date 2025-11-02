import { createRouter } from '../lib/util.js';
import contentRoutes from './content/index.js';

const router = createRouter().route('/content', contentRoutes);

export default router;
