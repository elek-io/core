import { createRouter } from '../../lib/util.js';
import v1Routes from './v1/index.js';

const router = createRouter().route('/v1', v1Routes);

export default router;
