/**
 * Entry of the `forms/summary` piece: the list a summary marker paints (BUG-42 §4.6).
 *
 * `bindForm` and `bindGroup` both paint one, so the painter is a frontier by the second rule of
 * §4.3. The markup travels with it: the server writes it through `@fudic/forms` and the client
 * repaints it through this piece, and it is the one function behind both that keeps them byte
 * for byte.
 *
 * It lives beside `src` and not inside it because it is an ARTEFACT of the build, not a module
 * of the package: `dist` must not grow a second name for the same values, and `src/**` is the
 * denominator of this package's coverage.
 */

export * from '../src/summary-markup.js';
export { bindSummary } from '../src/dom/summary.js';
