/** The extension of a contract file, sibling of the route or component whose server it declares. */
export const API_EXTENSION = '.fudapi';

export type * from './ast.js';
export { parseApi, DECLARATION_KEYWORDS } from './parse.js';
export { formatApi } from './format.js';
export { LOAD_MODES, LOAD_OPTIONS, LOAD_POLICIES, PAGE_CACHES, bufferBytes, durationMs } from './load-options.js';
export {
  createApiIndex,
  closest,
  typeText,
  GLOBAL_ID,
  type ApiIndex,
  type ApiSource,
  type Declared,
  type ProjectDecls,
  type ProjectKind,
} from './index-api.js';
export { validateApi, type ApiContext } from './validate.js';
export { projectCallables, routeCallables, type Callable, type RouteReach } from './reach.js';
export { isArgRule } from './validate-form.js';
export { formFields, type FormFieldFact } from './form-fields.js';
export { layoutPropsType, linkedComponents } from './layout-props.js';
/** The types the language has without declaring them: `str`, `file`, `u8`… */
export { PRIMITIVES } from './types-check.js';
export { dataShape, framesShape, type DataShape, type DataTy, type FramesShape } from './data-shape.js';
export { emitDeclarations } from './emit/declarations.js';
export { emitModule, type Side } from './emit/module.js';
export { extractApiMessages, type ApiLocale, type ApiMessage } from './messages.js';
/** The name a declaration of a `.fudapi` is exported by from `fudic:<id>`: `email-taken` → `emailTaken`. */
export { camel as exportedName } from './emit/shared.js';
