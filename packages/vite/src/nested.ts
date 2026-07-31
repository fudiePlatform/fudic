/**
 * What a NESTED build inherits from the host, and how its result reaches the output
 * (BUG-05 §3.1, §4.1, §4.3).
 *
 * Two builds run inside `generateBundle` with `configFile: false` — the Service Worker's
 * own bundle and the link pass — because their output is consumed by another loader. That
 * flag buys isolation and costs inheritance: whatever the host configures, they do not
 * see. The rule this module exists to enforce is that a nested build inherits the host's
 * OUTPUT configuration, and whatever it does not inherit is a decision someone wrote down.
 *
 * Their results are emitted as ASSETS, not chunks, so Vite never writes a `.map` beside
 * them and never appends a `sourceMappingURL`: an asset is a named run of bytes. Both are
 * this module's job.
 */

/** The host output settings a nested build honours. */
export interface NestedOutputOptions {
  readonly sourcemap: boolean | 'inline' | 'hidden';
  /**
   * BUG-06. It cannot be applied from the outside: both outputs enter the host bundle as
   * ASSETS, and minification runs in `renderChunk`, which an asset never traverses. The
   * only minification these files can get is the one their own nested build does — which
   * is why this is an inherited option and not a `renderChunk` hook.
   */
  readonly minify: boolean | 'oxc' | 'esbuild' | 'terser';
}

/** One file a nested build produced, with its map when one was asked for. */
export interface NestedArtifact {
  readonly fileName: string;
  readonly code: string;
  /** Omitted, never `undefined`: `exactOptionalPropertyTypes` is on. */
  readonly map?: string;
}

/** What to write for one artifact: its final code, and the sibling map when there is one. */
export interface EmitPlan {
  readonly code: string;
  readonly map?: { readonly fileName: string; readonly source: string };
}

/**
 * A bundler chunk's `map` as a JSON string, or nothing when the build produced none.
 *
 * Structural on purpose, like the chunk types themselves: Rollup hands back a `SourceMap`
 * instance whose `toString` is JSON, Rolldown a plain object, and a stringifying plugin a
 * string. All three carry the same v3 fields, and the fields are the contract.
 */
export function serializeMap(map: unknown): string | undefined {
  if (map === undefined || map === null) {
    return undefined;
  }
  return typeof map === 'string' ? map : JSON.stringify(map);
}

const URL_COMMENT = /\n?\/\/# sourceMappingURL=\S*[ \t]*$/u;

/**
 * Drop a trailing `//# sourceMappingURL=` line.
 *
 * The nested bundler may or may not have appended one depending on its own mode, and this
 * module appends the comment the HOST asked for. Normalising first is what keeps the two
 * from stacking — and what makes `'hidden'` mean hidden even if the inner build disagreed.
 */
export function stripSourceMappingURL(code: string): string {
  return code.replace(URL_COMMENT, '');
}

/** The base name of a path: a `sourceMappingURL` is resolved against the file's own directory. */
function baseNameOf(fileName: string): string {
  return fileName.slice(fileName.lastIndexOf('/') + 1);
}

/**
 * Compose what gets emitted for one artifact under the host's `sourcemap` setting.
 *
 * - `false` — the code, with no comment and no map. The default of Vite, and not ours to
 *   change: this BUG makes the option work, not the option true.
 * - `true` — the code plus `//# sourceMappingURL=<name>.map`, and the map as a sibling.
 * - `'hidden'` — the map, and no comment. For uploading to an error reporter.
 * - `'inline'` — the map as a data URI inside the code, and no second file.
 */
export function emitPlan(artifact: NestedArtifact, mode: NestedOutputOptions['sourcemap']): EmitPlan {
  const code = stripSourceMappingURL(artifact.code);
  if (mode === false || artifact.map === undefined) {
    return { code };
  }
  if (mode === 'hidden') {
    return { code, map: { fileName: `${artifact.fileName}.map`, source: artifact.map } };
  }
  if (mode === 'inline') {
    const data = Buffer.from(artifact.map, 'utf8').toString('base64');
    return { code: `${code}\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,${data}\n` };
  }
  return {
    code: `${code}\n//# sourceMappingURL=${baseNameOf(artifact.fileName)}.map\n`,
    map: { fileName: `${artifact.fileName}.map`, source: artifact.map },
  };
}
