/**
 * The global chain: every server function of the app walks it, `load` included.
 *
 * `csrf` closes the case of a foreign page calling with the user's cookies, `errorPages` sends
 * an error nobody caught to `_error.fud` — a 403 to `/entrar` instead — and `compress` gzips an
 * upload once it passes the threshold. fudic puts none of them anywhere on its own.
 */

import { chain, csrf, errorPages } from '@fudic/http';
import { log } from './middlewares/log';

export default chain()
  .use(log, csrf, errorPages({ 403: '/entrar' }))
  .compress({ format: 'gzip', min: 200 });
