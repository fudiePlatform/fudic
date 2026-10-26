/**
 * Entry of the `forms/contract` piece (SDD-60 §3.10): what the code generated from a `.fudapi`
 * builds its forms and rules with, and the registry the implementations fill.
 *
 * Only the names no other piece publishes. `@fudic/forms/contract` also re-exports `form`,
 * `str`, `required` and the rest, and those keep their own pieces: a name two pieces offer is
 * one the linker cannot answer, so it would be bundled — and a bundled `form` is a second copy
 * of the internals, whose `Symbol` the published binders do not recognise.
 *
 * It lives beside `src` and not inside it because it is an ARTEFACT of the build, not a module
 * of the package: `dist` must not grow a second name for the same values, and `src/**` is the
 * denominator of this package's coverage.
 */

export { uuid, UUID } from '../src/contract/uuid.js';
export { formOf } from '../src/contract/form.js';
export { rule, camel } from '../src/contract/rule.js';
export {
  compare,
  contains,
  isEmpty,
  lengthOf,
  requireOn,
  requireRule,
  same,
  validAt,
  valueAt,
} from '../src/contract/require.js';
export { messages, text } from '../src/contract/text.js';
export {
  Slot,
  folderOf,
  inTurn,
  loadingFile,
  resetRegistry,
  setFolders,
  takeRefusal,
} from '../src/contract/registry.js';
