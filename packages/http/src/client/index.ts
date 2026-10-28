/**
 * `@fudic/http/client`: the upload pipeline of a call. The stub of each function is the
 * generated module's (`./contract`); a page without server functions never imports it.
 */

export { STAGES } from './stages/index.js';
export type { CallInfo, Payload, Stage } from './pipeline.js';
