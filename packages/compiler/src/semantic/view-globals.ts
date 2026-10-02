/**
 * The globals a view may read (SDD-51 §3.4, decision 137).
 *
 * A short list, and a list of what is ALLOWED: every name here exists the same on the server
 * and in the browser and reading it has no effect. Anything else — `window`, `document`,
 * `globalThis`, `localStorage`, `fetch`, `setTimeout`, `process`, `eval`, `Function`,
 * `Promise`, `Reflect`, `Proxy` — either exists on one side only, which is how a hydration
 * stops matching, or does something, which a render pass must not.
 *
 * Exported because the editor completes from the same list: a name the view may not read is
 * a name it should not be offered.
 */
export const VIEW_GLOBALS: ReadonlySet<string> = new Set([
  'undefined',
  'NaN',
  'Infinity',
  'Math',
  'JSON',
  'Number',
  'String',
  'Boolean',
  'BigInt',
  'Symbol',
  'Array',
  'Object',
  'Date',
  'Intl',
  'Map',
  'Set',
  'parseInt',
  'parseFloat',
  'isNaN',
  'isFinite',
  'encodeURIComponent',
  'decodeURIComponent',
  'encodeURI',
  'decodeURI',
]);
