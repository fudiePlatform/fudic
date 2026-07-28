/**
 * Manifest assembly (SDD-20 §4.2): turn the ordered `RouteBuild` list into the contract
 * the server and the Service Worker both read. Single source, matched first-hit by
 * specificity (which the route order already encodes).
 *
 * Per route: its mode, the linkable chunk and its TOPOLOGICAL deps (the SW's `require`
 * is synchronous, so it must know what to load before what), the generated data
 * endpoint with its policy, and — when the build wrote HTML — the URL template of the
 * prerendered file. `csp` lives here so server and SW cannot diverge.
 */

import {
  type CachePolicy,
  type DataPolicy,
  type ManifestFile,
  type PagePolicy,
  type RouteRecord,
  DEFAULT_CSP,
} from '@fudic/transport';
import { type RouteBuild } from './discover.js';
import { htmlPathFor } from './prerender.js';
import { DATA_PREFIX } from './constants.js';
import { parseTtl } from './swconfig.js';
import { type FudicDiagnostic, FUD_TTL_INVALID, FUD_TWO_TTLS } from './diagnostics.js';

export interface ManifestInputs {
  readonly build: string;
  readonly base: string;
  /** Absolute URL of the linkable chunk of a `sw` route (empty when there is none). */
  readonly linkChunkOf: (route: RouteBuild) => string;
  /** Its dependencies, in topological order. */
  readonly depsOf: (route: RouteBuild) => readonly string[];
  /** The ESM chunk for the edge (dev/preview/prerender). */
  readonly esmOf: (route: RouteBuild) => string;
  /** Emit `sw` records at all (no `sw.json` → no Service Worker). */
  readonly serviceWorker: boolean;
}

export interface ManifestResult {
  readonly file: ManifestFile;
  readonly diagnostics: readonly FudicDiagnostic[];
}

const DEFAULT_DATA_POLICY: DataPolicy = { policy: 'cache-first', ttl: null };

/** `/` → `/index.html`, `/blog/:slug` → `/blog/:slug/index.html` (a URL template). */
function htmlUrlFor(base: string, pattern: string): string {
  return `${base}${htmlPathFor(pattern)}`.replace(/\/{2,}/gu, '/');
}

/** Read the route's data policy from its declared strategy. */
function dataPolicyOf(rb: RouteBuild, out: FudicDiagnostic[]): DataPolicy {
  const declared = rb.analysis.strategy.strategy.data;
  if (declared === undefined) {
    return DEFAULT_DATA_POLICY;
  }
  const ttl = parseTtl(declared.ttl);
  if (ttl === undefined) {
    out.push({
      code: FUD_TTL_INVALID,
      message: `strategy().data.ttl "${String(declared.ttl)}" is invalid (expected 30s/5m/2h/7d)`,
      file: rb.absPath,
    });
    return DEFAULT_DATA_POLICY;
  }
  return { policy: (declared.policy ?? 'cache-first') as CachePolicy, ttl };
}

/**
 * The page policy. `persist` is the surviving shape of SDD-19's incremental mode, and
 * it carries ONE rule: a route never has two TTLs — the HTML expires with its data.
 */
function pagePolicyOf(rb: RouteBuild, data: DataPolicy, out: FudicDiagnostic[]): PagePolicy | undefined {
  const declared = rb.analysis.strategy.strategy.page;
  if (declared?.cache !== 'persist') {
    return undefined; // 'never' is the default; no need to spell it out
  }
  const ttl = parseTtl(declared.ttl);
  if (ttl !== null && ttl !== undefined && ttl !== data.ttl) {
    out.push({
      code: FUD_TWO_TTLS,
      message: 'page.ttl differs from data.ttl with cache:"persist"; the data TTL wins',
      file: rb.absPath,
    });
  }
  return { cache: 'persist', ttl: data.ttl };
}

/** Build the manifest file from the discovered routes. */
export function buildManifest(
  routes: readonly RouteBuild[],
  inputs: ManifestInputs,
): ManifestResult {
  const diagnostics: FudicDiagnostic[] = [];
  const records: RouteRecord[] = [];

  for (const rb of routes) {
    const { decision } = rb;
    if (decision.mode === 'excluded') {
      continue;
    }
    // With no Service Worker a `sw` route still has to be reachable: the server renders
    // it on demand, which is exactly what `ssr` means to the client.
    const mode = decision.mode === 'sw' && !inputs.serviceWorker ? 'ssr' : decision.mode;
    const html = decision.prerenderedHtml ? htmlUrlFor(inputs.base, rb.route.pattern) : undefined;
    const esm = inputs.esmOf(rb);

    if (mode !== 'sw') {
      records.push({
        pattern: rb.route.pattern,
        mode,
        ...(html === undefined ? {} : { html }),
        ...(esm === '' ? {} : { esm }),
      });
      continue;
    }

    const dataPolicy = dataPolicyOf(rb, diagnostics);
    const page = pagePolicyOf(rb, dataPolicy, diagnostics);
    const deps = inputs.depsOf(rb);
    records.push({
      pattern: rb.route.pattern,
      mode: 'sw',
      chunk: inputs.linkChunkOf(rb),
      ...(deps.length === 0 ? {} : { deps }),
      // The data endpoint is GENERATED from `@server load`, never hand-written: one
      // source, two callers — the edge in process, the SW over HTTP (§4.5).
      ...(rb.analysis.hasLoad
        ? { data: `${inputs.base}${DATA_PREFIX.slice(1)}${rb.route.pattern}`.replace(/\/{2,}/gu, '/'), dataPolicy }
        : {}),
      ...(page === undefined ? {} : { page }),
      ...(html === undefined ? {} : { html }),
      ...(esm === '' ? {} : { esm }),
    });
  }

  return {
    file: { build: inputs.build, csp: DEFAULT_CSP, routes: records },
    diagnostics,
  };
}
