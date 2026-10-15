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
import { type LocaleCompile, type ResolveIo } from '@fudic/compiler';
import { remembered } from './build-memory.js';
import { transformFud, type ProjectStyles, type TransformResult } from './transform.js';
import { type LinkedAssets } from './linked-assets.js';

type Stripped = Awaited<ReturnType<typeof transformWithOxc>>;

/** The module a bundler takes for a `.fud`, and what the emit said about it. */
export interface CompiledFud {
  /** The emit's own result: diagnostics, missing assets, watch files, inline runtime. */
  readonly result: TransformResult;
  /**
   * The JavaScript, with the `.fud` → JS map Oxc composed. `null` when the emit's own errors
   * left code Oxc cannot parse: what the author has to read is those errors, which the pass
   * reports, and not Oxc's complaint about a generated file they never wrote.
   */
  readonly module: { readonly code: string; readonly map: NonNullable<Stripped['map']> } | null;
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
  /**
   * The locale it is compiled for (SDD-58). Its text arrives already translated through `io`;
   * this is what the emit adds on its own: the `lang` of a page without a layout and the
   * alternates. Remembered apart because `io` is that locale's, with a memory of its own.
   */
  i18n?: LocaleCompile,
): Promise<CompiledFud | null> {
  return remembered(io, `fud:${path}#${routeName ?? ''}`, async () => {
    const result = transformFud(path, io, routeName, styles, assets, i18n);
    if (result === null) return null;
    // `inMap`: Oxc composes `.fud` → TS with its own TS → JS, so the map describes the code
    // it actually returns rather than the text before the strip.
    let stripped: Stripped;
    try {
      stripped = await transformWithOxc(result.code, `${path}.ts`, { lang: 'ts', sourcemap: true }, result.map);
    } catch (error) {
      // A broken expression (`@(`) is a FUD error of the `.fud` AND a parse error of the
      // module emitted around it. The first is the one that points at what the author wrote.
      if (!result.diagnostics.some((d) => d.severity === 'error')) throw error;
      return { result, module: null };
    }
    // Asked for with `sourcemap: true` over a `.ts` name, Oxc always returns one: the type
    // says «maybe» for the calls that do not ask, and a branch here would be one no input
    // can take.
    return { result, module: { code: stripped.code, map: stripped.map! } };
  });
}
