/**
 * Manifest assembly (SDD-20 §4.2): turn the ordered `RouteBuild` list into the contract
 * the server and the Service Worker both read. Single source, matched first-hit by
 * specificity (which the route order already encodes).
 *
 * Per route: its mode, the linkable chunk and its TOPOLOGICAL deps (the SW's `require`
 * is synchronous, so it must know what to load before what), and the generated data
 * endpoint with its policy. `csp` lives here so server and SW cannot diverge.
 *
 * What this does NOT emit is the URL of a prerendered HTML file. That file belongs to
 * the edge and exists for the first visit; naming it here made the Service Worker
 * download a document per route instead of rendering it (BUG-02).
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
import { isLinkable } from './mode.js';
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
    const esm = inputs.esmOf(rb);

    // Everything the SW may render carries the same payload — `ssg` included, which is
    // the whole of BUG-02 §4.6. What it may render is `isLinkable`, the same predicate
    // the link pass uses, so the manifest can never promise a chunk that was not built.
    // Without a Service Worker nothing links at all.
    if (!inputs.serviceWorker || !isLinkable(decision)) {
      records.push({
        pattern: rb.route.pattern,
        mode,
        ...(esm === '' ? {} : { esm }),
      });
      continue;
    }

    const dataPolicy = dataPolicyOf(rb, diagnostics);
    const page = pagePolicyOf(rb, dataPolicy, diagnostics);
    const deps = inputs.depsOf(rb);
    const chunk = inputs.linkChunkOf(rb);
    records.push({
      pattern: rb.route.pattern,
      mode,
      // Omitted when the link pass produced nothing (FUD0399): the router asks for what
      // the record HAS, so an absent chunk means "the server serves this one".
      ...(chunk === '' ? {} : { chunk }),
      ...(deps.length === 0 ? {} : { deps }),
      // The data endpoint is GENERATED from `@server load`, never hand-written: one
      // source, two callers — the edge in process, the SW over HTTP (§4.5).
      ...(rb.analysis.hasLoad
        ? { data: `${inputs.base}${DATA_PREFIX.slice(1)}${rb.route.pattern}`.replace(/\/{2,}/gu, '/'), dataPolicy }
        : {}),
      ...(page === undefined ? {} : { page }),
      ...(esm === '' ? {} : { esm }),
    });
  }

  return {
    file: { build: inputs.build, csp: DEFAULT_CSP, routes: records },
    diagnostics,
  };
}
