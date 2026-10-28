/**
 * `@fudic/http/wire`: what both formats share (SDD-67 §3.6). The formats themselves are one
 * entry each, `./wire/bin` and `./wire/json`, so a page bundles only the one its functions use.
 */

export type { Primitive, Ty } from './ty.js';
export type { Wire } from './wire.js';
export { tyOfSchema } from './schema.js';
export { signature } from './signature.js';
