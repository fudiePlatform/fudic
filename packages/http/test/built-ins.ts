/**
 * SDD-60 §3.10 and criterion 23: the built-in middlewares as an app gets them — the pieces of
 * the module generated from `fudapi/middlewares.fudapi`, with the halves `impl/browser` and
 * `impl/server` register on them — as the steps a chain runs. The tests of `csrf` and
 * `error-pages` run against these and against the bare halves alike.
 */

import '../impl/browser/middlewares.js';
import '../impl/server/middlewares.js';
import { compose, use, type MiddlewarePiece } from '../src/contract/index.js';
import type { ErrorRoutes } from '../src/error-pages.js';
import * as browser from './generated/middlewares.browser.js';
import * as server from './generated/middlewares.server.js';

/** The steps of one side of a chain that uses `piece` alone. */
const stepsOf = <P>(piece: MiddlewarePiece<P, {}>, side: 'client' | 'server', params?: P) =>
  compose([{ steps: [{ use: [use(piece, params)] }] }], side).steps as never;

export const generated = {
  csrfClient: () => stepsOf(browser.csrf, 'client'),
  csrfServer: () => stepsOf(server.csrf, 'server'),
  /** A `.fudapi` names routes by status, as text only. */
  errorPages: (routes: Readonly<Record<number, string>> = {}) => stepsOf(browser.errorPages, 'client', { routes }),
};

export { browser, server };
export type { ErrorRoutes };
