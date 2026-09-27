/**
 * Entry of the `forms/wiring` piece: what the binders share, and `bindMessage`.
 *
 * `bindMessage` is a binder of its own (BUG-42 §4.9), but at ~120 compressed bytes it does not
 * clear a frontier, and it never travels alone: the emit writes it only for a marker inside a
 * `<form control>`, whose `bindForm` already reaches this piece. Inside it, it costs the page
 * that has such a marker nothing extra to ask for, and the one that has none a few bytes.
 *
 * It lives beside `src` and not inside it because it is an ARTEFACT of the build, not a module
 * of the package: `dist` must not grow a second name for the same values, and `src/**` is the
 * denominator of this package's coverage.
 */

export * from '../src/dom/wiring.js';
export { bindMessage } from '../src/dom/bind-message.js';
