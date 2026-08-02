/**
 * The runtime packages a built project resolves, aliased to their `dist` — what a consumer
 * gets from `node_modules`, since a temp project root has none.
 *
 * Shared because the list grew: the render side needs `@fudic/ssr` and `@fudic/transport`,
 * and since SDD-15 every component also leaves a client chunk, which imports `FudicElement`
 * from `@fudic/core` (and `@fudic/core` imports `@fudic/dom`). A project that does not
 * declare those two cannot build its own components — which is a real requirement of the
 * framework, not a test artefact, and the example declares them for the same reason.
 */

import { fileURLToPath } from 'node:url';

const dist = (pkg: string): string =>
  fileURLToPath(new URL(`../../../${pkg}/dist/index.js`, import.meta.url));

export const runtimeAlias: Readonly<Record<string, string>> = {
  '@fudic/ssr': dist('ssr'),
  '@fudic/transport': dist('transport'),
  '@fudic/core': dist('core'),
  '@fudic/dom': dist('dom'),
};
