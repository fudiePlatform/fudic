/**
 * One `.fud` compiled to the JavaScript module a bundler takes — once per build.
 *
 * The host bundle, the link pass and the edge pass each turn the same `.fud` into the same
 * module: `transformFud` with the same route name, the same style reader and the same asset
 * registry, then Oxc to strip the TypeScript the `@code` carries verbatim. They used to do it
 * three times. The answer is kept in the build's memory (`remembered`), so the second and
 * third pass get the first one's; under `vite dev` there is no memory and every request
 * compiles afresh, as it must.
 *
 * What each pass does WITH the answer stays with the pass: reporting the diagnostics (the
 * reporter already says each one once), watching snippet files, the FUD0363 of a missing
 * asset.
 */

import { transformWithOxc } from 'vite';
import { type ResolveIo } from '@fudic/compiler';
import { remembered } from './build-memory.js';
import { transformFud, type ProjectStyles, type TransformResult } from './transform.js';
import { type LinkedAssets } from './linked-assets.js';

type Stripped = Awaited<ReturnType<typeof transformWithOxc>>;

/** The module a bundler takes for a `.fud`, and what the emit said about it. */
export interface CompiledFud {
  /** The emit's own result: diagnostics, missing assets, watch files, inline runtime. */
  readonly result: TransformResult;
  /** The JavaScript, with the `.fud` → JS map Oxc composed. */
  readonly module: { readonly code: string; readonly map: NonNullable<Stripped['map']> };
}

/**
 * Compile `path` for a bundler, or `null` when it is not a `.fud`. Remembered per build under
 * the file and the route name it publishes: the only argument that is not the same object in
 * every pass of one build.
 */
export function compileFud(
  path: string,
  io: ResolveIo,
  routeName: string | undefined,
  styles: ProjectStyles,
  assets: LinkedAssets | undefined,
): Promise<CompiledFud | null> {
  return remembered(io, `fud:${path}#${routeName ?? ''}`, async () => {
    const result = transformFud(path, io, routeName, styles, assets);
    if (result === null) return null;
    // `inMap`: Oxc composes `.fud` → TS with its own TS → JS, so the map describes the code
    // it actually returns rather than the text before the strip.
    const stripped = await transformWithOxc(result.code, `${path}.ts`, { lang: 'ts', sourcemap: true }, result.map);
    // Asked for with `sourcemap: true` over a `.ts` name, Oxc always returns one: the type
    // says «maybe» for the calls that do not ask, and a branch here would be one no input
    // can take.
    return { result, module: { code: stripped.code, map: stripped.map! } };
  });
}
