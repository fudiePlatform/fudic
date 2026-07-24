/**
 * Emit (SDD-15). Canonical re-export. Slice 1 covers the SSR server branch:
 * one render function per component, plus its page-head style module.
 */

export { emitComponentSsr } from './component-ssr.js';
export { compileComponentSsr } from './compile.js';
export type { SsrEmitResult, Prop } from './component-ssr.js';
export { CodeWriter } from './writer.js';
export { resolveComponents, linkHref } from './resolve.js';
export type { ResolveIo, ResolvedComponent, ComponentGraph } from './resolve.js';
export { emitComponentModule, emitPageModule } from './module.js';
