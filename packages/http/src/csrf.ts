/**
 * `csrf` closes the case of a foreign page firing a request with the user's cookies (SDD-56
 * §4.11). A form on another site cannot set a header of its own, and a cross-origin `fetch`
 * with one needs a CORS preflight the server never grants: the header is enough, and there
 * are no tokens to keep or rotate.
 */

import { csrfClient } from './csrf-client.js';
import { csrfServer } from './csrf-server.js';
import { middleware } from './middleware.js';
import type { Middleware } from './types.js';

export { CSRF_HEADER } from './csrf-client.js';

export const csrf: Middleware = /*#__PURE__*/ middleware().client(csrfClient).server(csrfServer);
