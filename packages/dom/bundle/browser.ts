/**
 * Entry of the `dom/browser` piece (SDD-45 §4.3): the adapter every fudic page that paints
 * ends up naming, and the three namespaces it decides an element's with.
 *
 * `ns.ts` has one consumer — the adapter, which resolves an element's namespace once, when it
 * is created — so by the second rule of §4.3 it gets no frontier and travels inside the piece
 * that reaches it. What that rule does NOT say, and what this file exists for, is that being
 * inside a piece is not the same as being reachable from it: `NS` is a public export of this
 * package and no URL offered the name, so `import { NS } from '@fudic/dom'` had nowhere to be
 * rewritten to.
 *
 * It lives beside `src` and not inside it because it is an ARTEFACT of the build, not a module
 * of the package: `dist` must not grow a second name for the same values, and `src/**` is the
 * denominator of this package's coverage.
 */

export { browserDom } from '../src/browser.js';
// The guard travels inside the adapter that calls it; `trustedUrl` is published from the same
// piece, so an application that marks a URL marks it for the very guard that reads the mark.
export { trustedUrl } from '../src/url.js';
export { NS, type Ns } from '../src/ns.js';
