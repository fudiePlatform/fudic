/**
 * The Oxc integration (SDD-11): one synthetic buffer, one `parseSync`, offsets
 * mapped back to source. Canonical re-export.
 */

export type { JsFragmentKind, FragmentId, OxcNode, JsBatchResult } from './batch.js';
export { JsBatch } from './batch.js';
export type { PatternVisitor } from './pattern.js';
export { walkPattern, patternNames, loopHeaderNames } from './pattern.js';
export type { HookKind, HookUse, HookShadow, HookScan } from './lifecycle.js';
export { HOOK_KINDS, CREATE_HOOKS, isHookKind, scanHooks } from './lifecycle.js';
