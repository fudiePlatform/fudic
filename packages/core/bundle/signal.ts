/**
 * Entry of the `core/signal` piece (SDD-45 §4.3): the writable value and the grouping of
 * writes, which are one piece because they are one module graph.
 *
 * `batch` has a single consumer — `signal.ts` imports `notify` from it to park subscribers —
 * so by the second rule of §4.3 it gets no frontier of its own and travels inside the piece
 * that reaches it. What that rule does NOT say, and what this file exists for, is that being
 * inside a piece is not the same as being reachable from it: `batch` was in these bytes
 * already and no URL offered the name, so `import { batch } from '@fudic/core'` had nowhere
 * to be rewritten to. That is a 404 that waits until somebody writes the import.
 *
 * It lives beside `src` and not inside it because it is an ARTEFACT of the build, not a
 * module of the package: `dist` must not grow a second name for the same value, and `src/**`
 * is the denominator of this package's coverage.
 */

export { signal, type Signal } from '../src/signal.js';
export { batch } from '../src/batch.js';
