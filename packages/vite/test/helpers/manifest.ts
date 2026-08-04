/**
 * Reading the emitted manifest the way a client reads it (SDD-27 §5.4).
 *
 * The manifest states NAMES; the URLs come from `@fudic/transport`'s resolver. Asserting
 * through the resolver rather than against a literal is the point: it checks that the
 * derivation the Service Worker will perform lands on a file the build actually wrote,
 * which is the one thing a hand-written expectation cannot check.
 */

import { compileManifest, type ManifestFile, type RouteTable } from '@fudic/transport';

/** A bundle entry, structurally — the exact type moves between Rollup and Rolldown. */
interface OutputLike {
  readonly type: string;
  readonly fileName: string;
  readonly source?: unknown;
  readonly code?: string;
}

export function manifestFile(output: readonly OutputLike[]): ManifestFile {
  const asset = output.find((o) => o.fileName === 'fudic-routes.json');
  if (asset === undefined) {
    throw new Error('fudic-routes.json was not emitted');
  }
  return JSON.parse(String(asset.source)) as ManifestFile;
}

export function routeTable(output: readonly OutputLike[]): RouteTable {
  return compileManifest(manifestFile(output));
}

/** The render-chunk URL of a pattern, or `null` when the route is the server's. */
export function renderUrlOf(output: readonly OutputLike[], pattern: string): string | null {
  const table = routeTable(output);
  const record = manifestFile(output).routes.find((r) => r.pattern === pattern);
  if (record === undefined) {
    throw new Error(`no record for ${pattern}`);
  }
  return table.urls.renderUrl(record);
}

/** Whether the build emitted the file an absolute derived URL points at. */
export function emitted(output: readonly OutputLike[], url: string): boolean {
  return output.some((o) => `/${o.fileName}` === url);
}
