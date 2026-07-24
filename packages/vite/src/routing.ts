/**
 * Filesystem routing (SDD-19 §4.1). A page `.fud` under `routesDir` becomes a
 * route by its directory path: `index.fud` → `/`, `customer/index.fud` →
 * `/customer`, `customer/[id].fud` → the pattern `/customer/:id`. The dynamic
 * segment token is bracket `[id]` (the only form). Routes come out ordered by
 * DESCENDING specificity (static before param at the first differing segment), so
 * the emitted manifest can be matched first-hit at runtime (SDD-19 §4.7).
 *
 * Pure and filesystem-free: it takes the list of page file paths (relative to
 * `routesDir`) and returns route records + diagnostics. The plugin owns the walk
 * and the page/component discrimination.
 */

import {
  type FudicDiagnostic,
  FUD_MALFORMED_PARAM,
  FUD_ROUTE_COLLISION,
} from './diagnostics.js';

/** A resolved route: its source file, its path pattern, and its param names in order. */
export interface Route {
  /** Page file path relative to `routesDir`, e.g. `customer/[id].fud`. */
  readonly file: string;
  /** Path pattern; a `:name` segment is a param, e.g. `/customer/:id`. */
  readonly pattern: string;
  /** Param names in path order, e.g. `['id']`. Empty for a static route. */
  readonly params: readonly string[];
}

export interface RoutingResult {
  /** Routes ordered by descending specificity (ready for the manifest). */
  readonly routes: readonly Route[];
  readonly diagnostics: readonly FudicDiagnostic[];
}

const PARAM_SEGMENT = /^\[(.*)\]$/u;
const PARAM_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/u;

interface Compiled {
  readonly file: string;
  readonly pattern: string;
  readonly params: readonly string[];
  readonly diagnostics: readonly FudicDiagnostic[];
}

/** Turn one page file path into its route pattern + params (+ any param diagnostics). */
function compile(file: string): Compiled {
  const normalized = file.replace(/\\/gu, '/');
  const noExt = normalized.replace(/\.fud$/u, '');
  const rawSegments = noExt.split('/').filter((s) => s.length > 0);
  // A trailing `index` is the directory root: `customer/index` → `/customer`.
  if (rawSegments[rawSegments.length - 1] === 'index') {
    rawSegments.pop();
  }

  const params: string[] = [];
  const out: string[] = [];
  const diagnostics: FudicDiagnostic[] = [];
  for (const seg of rawSegments) {
    const m = PARAM_SEGMENT.exec(seg);
    if (m === null) {
      out.push(seg);
      continue;
    }
    const name = m[1] ?? '';
    if (!PARAM_NAME.test(name)) {
      diagnostics.push({
        code: FUD_MALFORMED_PARAM,
        message: `Malformed route param segment "[${name}]" in ${file}`,
        file,
      });
      continue;
    }
    if (params.includes(name)) {
      diagnostics.push({
        code: FUD_MALFORMED_PARAM,
        message: `Duplicate route param ":${name}" in ${file}`,
        file,
      });
      continue;
    }
    params.push(name);
    out.push(`:${name}`);
  }

  const pattern = out.length === 0 ? '/' : `/${out.join('/')}`;
  return { file, pattern, params, diagnostics };
}

/** Specificity score per segment: static (1) is more specific than a param (0). */
function scores(pattern: string): number[] {
  return pattern
    .split('/')
    .filter((s) => s.length > 0)
    .map((s) => (s.startsWith(':') ? 0 : 1));
}

/** Descending specificity: static before param at the first differing segment; deterministic. */
function bySpecificity(a: Route, b: Route): number {
  const sa = scores(a.pattern);
  const sb = scores(b.pattern);
  const n = Math.min(sa.length, sb.length);
  for (let i = 0; i < n; i += 1) {
    if (sa[i] !== sb[i]) {
      return sb[i]! - sa[i]!;
    }
  }
  if (sa.length !== sb.length) {
    return sb.length - sa.length; // deeper path first
  }
  return a.pattern < b.pattern ? -1 : a.pattern > b.pattern ? 1 : 0;
}

/** Resolve page file paths (relative to `routesDir`) to ordered routes + diagnostics. */
export function routesFromFiles(files: readonly string[]): RoutingResult {
  // Sort inputs so collision "first wins" and the whole result are deterministic.
  const sorted = [...files].filter((f) => f.endsWith('.fud')).sort();

  const routes: Route[] = [];
  const diagnostics: FudicDiagnostic[] = [];
  const seen = new Map<string, string>(); // pattern → first file that produced it

  for (const file of sorted) {
    const c = compile(file);
    diagnostics.push(...c.diagnostics);
    const owner = seen.get(c.pattern);
    if (owner !== undefined) {
      diagnostics.push({
        code: FUD_ROUTE_COLLISION,
        message: `Route "${c.pattern}" is produced by both ${owner} and ${file}`,
        file,
      });
      continue;
    }
    seen.set(c.pattern, file);
    routes.push({ file: c.file, pattern: c.pattern, params: c.params });
  }

  routes.sort(bySpecificity);
  return { routes, diagnostics };
}
