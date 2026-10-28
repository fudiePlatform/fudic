// The setup registers the matchers of jest-dom at runtime; this gives their types to whoever
// imports the package, so `expect(t.host).toBeInTheDocument()` is not red in the editor or in
// `tsc` (BUG-50 §6.5).
/// <reference types="@testing-library/jest-dom/vitest" preserve="true" />
export { mount, renderToHtml, type FudModule, type Mounted, type MountOptions } from './mount.js';
export { visit, type Visited, type VisitOptions } from './visit.js';
export { renderLayout, type LayoutOptions } from './layout.js';
export { renderSnippet, type SnippetOptions } from './snippet.js';
export type { TemplateAttributes } from './matchers.js';
export { shadowOf, type ShadowShape } from './shadow.js';
export type { ProviderOverride } from './providers.js';
export type { Queries, ByRoleOptions } from './queries.js';
export type { Gestures } from './gestures.js';
export type { Harness, WorldOptions } from './session.js';
export { clientGraphOf, type ClientGraph } from './client-graph.js';
export type { FetchOverride } from './fetch.js';
export { respond, respondProblem } from './respond.js';
