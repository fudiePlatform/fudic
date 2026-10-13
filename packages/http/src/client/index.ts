/**
 * `@fudic/http/client`: the stub the compiler emits for each server function, and the two
 * upload pipelines it can be given. A page without server functions never imports it.
 */

export { $fn, type FnSpec } from './fn.js';
export { FORM_STAGES, KEYED_STAGES } from './stages/index.js';
export type { CallInfo, Payload, Stage } from './pipeline.js';
