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

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = (pkg: string): string =>
  fileURLToPath(new URL(`../../../${pkg}/dist/index.js`, import.meta.url));

export const runtimeAlias: Readonly<Record<string, string>> = {
  '@fudic/ssr': dist('ssr'),
  '@fudic/transport': dist('transport'),
  '@fudic/core': dist('core'),
  '@fudic/dom': dist('dom'),
};

/**
 * A `tsconfig.json` that types `@fudic/*` from the same `dist` the aliases above resolve.
 *
 * Since SDD-35 every build typechecks the project first, and a temp project has no
 * `node_modules`: without this, every `import … from '@fudic/core'` in a `.fud` is `TS2307`
 * and the build fails before it compiles anything — correctly, since the editor would mark
 * the same import. The options are the ones the check infers without a `tsconfig.json`
 * (Volar's), so the only thing this file adds is where `@fudic/*` lives.
 */
export const TYPECHECK_TSCONFIG = JSON.stringify({
  compilerOptions: {
    module: 'commonjs',
    target: 'es2020',
    jsx: 'preserve',
    strictFunctionTypes: true,
    allowJs: true,
    allowSyntheticDefaultImports: true,
    resolveJsonModule: true,
    paths: { '@fudic/*': [fileURLToPath(new URL('../../../*/dist/index.d.ts', import.meta.url))] },
  },
});

/** Write {@link TYPECHECK_TSCONFIG} at `root`. */
export function writeTypecheckConfig(root: string): void {
  writeFileSync(join(root, 'tsconfig.json'), TYPECHECK_TSCONFIG);
}
