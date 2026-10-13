/**
 * `@fudic/forms/wire`: a typed form in binary and back (SDD-56 §3.10, §4.18). What the upload
 * pipeline of `@fudic/http` calls; a page that never sends a typed form never imports it.
 */

export { isTyped, readBinary, representable, writeBinary } from './binary.js';
export { reviveJson } from './json.js';
