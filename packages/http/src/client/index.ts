/**
 * `@fudic/http/client`: the two upload pipelines a call can be given. The stub of each function
 * is the generated module's (`./contract`); a page without server functions never imports it.
 */

export { FORM_STAGES, KEYED_STAGES } from './stages/index.js';
export type { CallInfo, Payload, Stage } from './pipeline.js';
