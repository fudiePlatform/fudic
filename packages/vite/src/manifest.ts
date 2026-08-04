/**
 * Manifest assembly (SDD-20 §4.2): turn the ordered `RouteBuild` list into the contract
 * the server and the Service Worker both read. Single source, matched first-hit by
 * specificity (which the route order already encodes).
 *
 * Per route: its mode, its TOPOLOGICAL deps (the SW's `require` is synchronous, so it
 * must know what to load before what), and the policy of its generated data endpoint.
 * `csp` lives here so server and SW cannot diverge.
 *
 * What this does NOT emit is a URL — any URL (SDD-27 §5.4). Not the prerendered HTML
 * file, which belongs to the edge and whose naming here made the Service Worker download
 * a document per route instead of rendering it (BUG-02); and not a chunk either, because
 * chunk names derive from the pattern and the tag, and carry the build id rather than a
 * content hash. The record states what cannot be derived: WHICH components, in WHICH
 * order, and whether the route has data.
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
import { parseTtl } from './swconfig.js';
import { type FudicDiagnostic, FUD_TTL_INVALID, FUD_TWO_TTLS } from './diagnostics.js';

export interface ManifestInputs {
  readonly build: string;
  readonly base: string;
  /**
   * The component chunk NAMES a route needs, topologically ordered, or `null` when the
   * link pass produced no entry chunk for it (FUD0399).
   *
   * Names, not URLs (SDD-27 §5.4): where a chunk lives is derivable from its name and the
   * build id, so the manifest states only what cannot be derived — which components, in
   * which order.
   */
  readonly depsOf: (route: RouteBuild) => readonly string[] | null;
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

    // Everything the SW may render carries the same payload — `ssg` included, which is
    // the whole of BUG-02 §4.6. What it may render is `isLinkable`, the same predicate
    // the link pass uses, so the manifest can never promise a chunk that was not built.
    // Without a Service Worker nothing links at all.
    const deps = !inputs.serviceWorker || !isLinkable(decision) ? null : inputs.depsOf(rb);
    if (deps === null) {
      // No `deps` key at all: its ABSENCE is what tells the router this route is the
      // server's, whatever its mode says (SDD-27 §5.4). An empty list would mean the
      // opposite — renderable, with no components.
      records.push({ pattern: rb.route.pattern, mode });
      continue;
    }

    const dataPolicy = dataPolicyOf(rb, diagnostics);
    const page = pagePolicyOf(rb, dataPolicy, diagnostics);
    records.push({
      pattern: rb.route.pattern,
      mode,
      deps,
      // The data endpoint is GENERATED from `@server load`, never hand-written: one
      // source, two callers — the edge in process, the SW over HTTP (§4.5). The URL is
      // derived from the pattern, so its POLICY is what states the route has one.
      ...(rb.analysis.hasLoad ? { dataPolicy } : {}),
      ...(page === undefined ? {} : { page }),
    });
  }

  return {
    file: { build: inputs.build, base: inputs.base, csp: DEFAULT_CSP, routes: records },
    diagnostics,
  };
}
