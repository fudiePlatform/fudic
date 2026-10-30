/**
 * The runtime packages a built project resolves, aliased to their `dist` — what a consumer
 * gets from `node_modules`, since a temp project root has none.
 *
 * Shared because the list grew: the render side needs `@fudic/ssr` and `@fudic/transport`,
 * and since SDD-15 every component also leaves a client chunk, which imports `FudicElement`
 * from `@fudic/core` (and `@fudic/core` imports `@fudic/dom`). A project that does not
 * declare those two cannot build its own components — which is a real requirement of the
 * framework, not a test artefact, and the example declares them for the same reason.
 *
 * Since SDD-56 a route with `load` runs it through `@fudic/http/server` (its `ServerContext`,
 * its chain), so a project with a `load` needs `@fudic/http` as it needs `@fudic/ssr`. Only the
 * subpath the wrapper imports: its own dependencies resolve from where the `dist` lives.
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = (pkg: string, entry = 'index.js'): string =>
  fileURLToPath(new URL(`../../../${pkg}/dist/${entry}`, import.meta.url));

export const runtimeAlias: Readonly<Record<string, string>> = {
  '@fudic/ssr': dist('ssr'),
  '@fudic/transport': dist('transport'),
  '@fudic/core': dist('core'),
  '@fudic/dom': dist('dom'),
  '@fudic/http/server': dist('http', 'server/index.js'),
  // What the wrapper writes and reads the data endpoint's frames with (SDD-70 §3.7).
  '@fudic/http/wire/frames': dist('http', 'wire/frames.js'),
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
