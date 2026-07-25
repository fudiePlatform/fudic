/**
 * Emit (SDD-15). Canonical re-export: the component dependency graph and the module
 * emitters that turn it into one `.mjs` per component plus one for the page.
 */

export { CodeWriter } from './writer.js';
export { resolveComponents, linkHref } from './resolve.js';
export type { ResolveIo, ResolvedComponent, ComponentGraph } from './resolve.js';
export { emitComponentModule, emitPageModule, type EmitOptions } from './module.js';
