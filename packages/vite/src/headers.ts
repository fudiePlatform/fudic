/**
 * The app's headers in the build (SDD-84 §4.2): the three `.headers` files read once, as the
 * manifest carries them, and the checks that need the output — what fudic emitted against the
 * policies (`FUD1545`, `FUD1548`, `FUD1556`) and the cache rules against the files and `sw.json`
 * (`FUD1551`–`FUD1553`).
 */

import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  checkNeeds,
  CSP_NEEDS_FILE,
  cspOf,
  HEADERS_FILES,
  HEADERS_TEMPLATES,
  type AssetRule,
  type CspNeed,
  type CspPolicy,
  type HeaderEntry,
  type HeadersConfig,
  type HeadersRead,
} from '@fudic/config';
import { FUD1551, FUD1552, FUD1553, type FileDiagnostic } from '@fudic/diagnostics';
import { assetDecisionsFor, globMatches, orderAssetRules, type ManifestHeaders } from '@fudic/transport';

export { CSP_NEEDS_FILE };

const CSP = 'content-security-policy';
const HSTS = 'strict-transport-security';

/** Name → value, in the order of the file. */
function recordOf(entries: readonly HeaderEntry[]): Readonly<Record<string, string>> {
  return Object.fromEntries(entries.map((entry) => [entry.name, entry.value]));
}

/** What the manifest carries: the three files, the rules of `assets.headers` most specific first. */
export function manifestHeadersOf(config: HeadersConfig): ManifestHeaders {
  return {
    page: recordOf(config.page),
    sw: recordOf(config.sw),
    assets: orderAssetRules(config.assets.map((rule) => ({ pattern: rule.pattern, headers: recordOf(rule.headers) }))),
  };
}

/**
 * What dev serves (SDD-84 §4.5): `page.headers` without the CSP — Vite's client injects scripts
 * without a nonce — and without HSTS, as dev goes over `http:`. The rest as it is.
 */
export function devHeadersOf(headers: ManifestHeaders): ManifestHeaders {
  const page = Object.fromEntries(Object.entries(headers.page).filter(([name]) => ![CSP, HSTS].includes(name.toLowerCase())));
  return { ...headers, page };
}

/** The page's CSP as written, `{nonce}` in it, or undefined when the file has none. */
export function pageCspOf(headers: ManifestHeaders): string | undefined {
  return Object.entries(headers.page).find(([name]) => name.toLowerCase() === CSP)?.[1];
}

/** The CSP of `kind` as a browser reads it, positioned in its file (or its template), or undefined. */
export function policyOf(read: HeadersRead, kind: 'page' | 'sw'): CspPolicy | undefined {
  return cspOf(read.sources[kind]?.text ?? HEADERS_TEMPLATES[kind], read.config[kind]);
}

/** What the output of the pages and of the Service Worker needs from each policy. */
export interface EmittedNeeds {
  readonly page: readonly CspNeed[];
  /** Absent: the app has no Service Worker. */
  readonly sw?: readonly CspNeed[];
}

/**
 * The needs against the policies (SDD-84 §3.4): `FUD1545` (page) and `FUD1548` (worker) for what
 * does not get in, `FUD1556` for what the policy keeps for fudic and nothing needs.
 */
export function checkEmitted(read: HeadersRead, needs: EmittedNeeds): readonly FileDiagnostic[] {
  const page = checkNeeds('page', policyOf(read, 'page'), needs.page, HEADERS_FILES.page);
  const sw = needs.sw === undefined ? [] : checkNeeds('sw', policyOf(read, 'sw'), needs.sw, HEADERS_FILES.sw);
  return [...page, ...sw].map((finding) => finding.diagnostic);
}

/** The text of `.fudic/csp-needs.json`: by file, each need as the piece declared it. */
export function cspNeedsJson(needs: EmittedNeeds): string {
  return `${JSON.stringify(
    {
      [HEADERS_FILES.page]: dedupe(needs.page),
      ...(needs.sw === undefined ? {} : { [HEADERS_FILES.sw]: dedupe(needs.sw) }),
    },
    null,
    2,
  )}\n`;
}

/** Write `.fudic/csp-needs.json` under `root`, for the editor. */
export function writeCspNeeds(root: string, needs: EmittedNeeds): void {
  const path = join(root, CSP_NEEDS_FILE);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, cspNeedsJson(needs));
}

/** Each need once, in the order first met. */
export function dedupe(needs: readonly CspNeed[]): readonly CspNeed[] {
  const seen = new Map<string, CspNeed>();
  for (const need of needs) {
    const key = JSON.stringify(need);
    if (!seen.has(key)) seen.set(key, need);
  }
  return [...seen.values()];
}

/** One file of the build, by path without `base`. */
export interface BuiltFile {
  readonly path: string;
  /** Whether its name changes when its bytes do. */
  readonly hashed: boolean;
}

/**
 * Whether a file the bundle produced carries a hash in its name: its stem ends in `-` and eight
 * characters of base64url — Vite's `[hash]`, fudic's build id and the linked copies alike. The hash is
 * followed only by extensions: a sourcemap (`x-1a2B3c4D.js.map`) is as hashed as its chunk, and a
 * dot before it (`di-owner.ioc-1a2B3c4D.js`) is part of the stem.
 */
export function isHashedName(fileName: string): boolean {
  const name = fileName.slice(fileName.lastIndexOf('/') + 1);
  return /-[\w-]{8}(?:\.[a-z\d]+)*$/iu.test(name);
}

/** What the Service Worker precaches or keeps cache-first, by path without `base`. */
export interface SwCaching {
  readonly shell: readonly string[];
  readonly cacheFirst: readonly string[];
}

/** A day, in seconds: from it on, a cache is long (`FUD1552`). */
const LONG_CACHE = 86_400;

/** The directives of a `Cache-Control` value, lowercased, without their arguments. */
function directivesOf(value: string): ReadonlyMap<string, string | undefined> {
  return new Map(
    value
      .split(',')
      .map((part) => part.trim().toLowerCase())
      .filter((part) => part !== '')
      .map((part) => {
        const [name, arg] = part.split('=', 2);
        return [name!.trim(), arg?.trim()] as const;
      }),
  );
}

/**
 * The rules of `assets.headers` against the build (SDD-84 §3.4): `FUD1551` for `no-cache` or
 * `no-store` on a hashed file the worker caches, `FUD1552` for a long cache on a name without a hash, and
 * `FUD1553` for a rule that matches nothing. Each one on the path of the rule that wins.
 */
export function checkAssets(rules: readonly AssetRule[], files: readonly BuiltFile[], sw: SwCaching | null): readonly FileDiagnostic[] {
  const file = HEADERS_FILES.assets;
  const out: FileDiagnostic[] = [];
  const reported = new Set<string>();
  const once = (key: string, diagnostic: () => FileDiagnostic): void => {
    if (reported.has(key)) return;
    reported.add(key);
    out.push(diagnostic());
  };
  const ordered = orderAssetRules(rules);
  const manifest: ManifestHeaders = {
    page: {},
    sw: {},
    assets: ordered.map((rule) => ({ pattern: rule.pattern, headers: recordOf(rule.headers) })),
  };
  const cached = (path: string): boolean =>
    sw !== null && (sw.shell.includes(path) || sw.cacheFirst.some((pattern) => globMatches(pattern, path)));
  for (const built of files) {
    const decided = Object.entries(assetDecisionsFor(manifest, built.path)).find(([name]) => name.toLowerCase() === 'cache-control');
    if (decided === undefined || decided[1] === '') continue;
    const rule = ordered.find((r) => globMatches(r.pattern, built.path) && r.headers.some((h) => h.name === decided[0]))!;
    const directives = directivesOf(decided[1]);
    const fresh = ['no-cache', 'no-store'].find((d) => directives.has(d));
    // Only on a file with a hash: one without has to be revalidated, or the worker would keep
    // the old one, so `no-cache` is the right answer for it (SDD-84 §8.2).
    if (fresh !== undefined && built.hashed && cached(built.path)) {
      once(`1551 ${rule.pattern}`, () => FUD1551({ file, span: rule.span, pattern: rule.pattern, path: built.path, directive: fresh }));
    }
    const maxAge = Number(directives.get('max-age'));
    const long = directives.has('immutable') ? 'immutable' : maxAge >= LONG_CACHE ? `max-age=${maxAge}` : undefined;
    if (long !== undefined && !built.hashed) {
      once(`1552 ${rule.pattern}`, () => FUD1552({ file, span: rule.span, pattern: rule.pattern, path: built.path, directive: long }));
    }
  }
  for (const rule of rules) {
    if (!files.some((built) => globMatches(rule.pattern, built.path))) {
      out.push(FUD1553({ file, span: rule.span, pattern: rule.pattern }));
    }
  }
  return out;
}

/** The files under `dir` (the public directory), as paths from it with a leading `/`. */
export function publicFilesOf(dir: string): readonly string[] {
  if (dir === '' || !existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => `/${relative(dir, join(entry.parentPath, entry.name)).replace(/\\/gu, '/')}`);
}

/**
 * Every file of the build, by path without `base`: what the bundle produced, hashed or not by
 * its name, and what the public directory copies as it is, never hashed.
 */
export function builtFilesOf(bundled: Iterable<string>, publicFiles: readonly string[]): readonly BuiltFile[] {
  return [
    ...[...bundled].map((fileName) => ({ path: `/${fileName}`, hashed: isHashedName(fileName) })),
    ...publicFiles.map((path) => ({ path, hashed: false })),
  ];
}
