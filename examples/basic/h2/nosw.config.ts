import { mergeConfig } from 'vite';
import nosw from '../nosw/vite.config.js';
import h2 from './vite.config.js';

/**
 * The preview of the build WITHOUT a Service Worker (`pnpm build:nosw`), over HTTP/2. With a
 * worker, every navigation after the first is painted by it, locally: the server is never asked
 * and there is no `103` to see. Without one, every navigation goes to the server, and every one
 * gets its `103`.
 */
export default mergeConfig(nosw, { preview: h2.preview });
