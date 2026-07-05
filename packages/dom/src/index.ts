/**
 * Entry point of `@fudic/dom`.
 *
 * The isomorphic node contract of the fudic runtime (SDD-14): `Dom<N>` (the
 * construction surface both adapters share) and `DomClient<N>` (the browser-only
 * surface), the `browserDom` client adapter, the `NS` namespaces, and the
 * hydration `Cursor`. The SSR adapter lives in `@fudic/ssr`; the reactive
 * runtime (signal, lifecycle, delegation) lives in `@fudic/core`.
 */

export const VERSION = '0.0.1';

export { NS, type Ns } from './ns.js';
export { type Dom, type DomClient } from './dom.js';
export { browserDom } from './browser.js';
export { type Cursor, cursorOf } from './cursor.js';
