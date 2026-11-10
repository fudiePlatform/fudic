/**
 * Entry of the `forms/flags` piece: the two marks a rule can carry, server-only and
 * asynchronous, and the mark of a whole-form pass (SDD-80 §4.3).
 *
 * Each one is a `Symbol`, and that is why they are a piece at all: two copies of a mark would be
 * two symbols, and a rule marked through one would go unrecognised by the other. They travel
 * together because they are the same kind of thing, reached by the same pieces — `control`,
 * `form`, `run-rule` and `validators` — and apart each would be a frontier for a dozen bytes.
 *
 * It lives beside `src` and not inside it because it is an ARTEFACT of the build, not a module
 * of the package: `dist` must not grow a second name for the same values, and `src/**` is the
 * denominator of this package's coverage.
 */

export * from '../src/server-flag.js';
export * from '../src/async-flag.js';
export * from '../src/whole-pass.js';
