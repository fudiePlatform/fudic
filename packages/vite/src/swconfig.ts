/**
 * `sw.json` — the application's Service Worker configuration (SDD-20 §4.7). The app
 * developer writes it: the shell to precache and the cache policy per RESOURCE CLASS.
 * It does not declare routes — that is each page's business (`strategy()`, §4.8).
 *
 * **No `sw.json`, no Service Worker.** Everything is then server/SSG. That is an
 * explicit decision, not a silent default.
 *
 * One rule the author of a `resources` class has to know (BUG-04 §4.3): **the cache key is
 * the URL, and only the URL**. `Vary` on the response is not consulted, because this
 * framework does not negotiate content and will not negotiate halfway. So if a response
 * depends on a request header, that axis belongs IN THE URL — a resource class pointed at
 * an endpoint that varies by `Accept-Language` is an application error, not a case the
 * framework resolves. The `shell` is stricter still: exact URLs, served by identity.
 *
 * Reading it is pure text work: `read` is injected so this stays testable without a
 * filesystem, and it NEVER throws — a malformed file is a diagnostic and no SW.
 */

import { type CachePolicy, type ResourceRule } from '@fudic/transport';
import {
  type FudicDiagnostic,
  FUD_SW_CONFIG_MALFORMED,
  FUD_TTL_INVALID,
} from './diagnostics.js';
import { SW_CONFIG_FILE } from './constants.js';

export interface ResourceRuleFile {
  readonly pattern: string;
  readonly policy: CachePolicy;
  readonly ttl?: string | null;
  readonly maxEntries?: number;
}

export interface SwConfigFile {
  readonly shell?: readonly string[];
  readonly resources?: Readonly<Record<string, ResourceRuleFile>>;
  readonly dev?: 'off' | 'preview';
}

export interface ResolvedSwConfig {
  readonly shell: readonly string[];
  /** Compiled rules IN EVALUATION ORDER: the first pattern that matches wins. */
  readonly resources: readonly ResourceRule[];
  readonly dev: 'off' | 'preview';
}

export interface SwConfigResult {
  /** `null` when there is no `sw.json`, or it is unusable. */
  readonly config: ResolvedSwConfig | null;
  readonly diagnostics: readonly FudicDiagnostic[];
}

const POLICIES: readonly string[] = [
  'cache-first',
  'network-first',
  'stale-while-revalidate',
  'network-only',
];

const UNITS: Readonly<Record<string, number>> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

/** `30s` · `5m` · `2h` · `7d` → ms. `null`/absent → `null`. Invalid → `undefined`. */
export function parseTtl(spec: string | null | undefined): number | null | undefined {
  if (spec === null || spec === undefined) {
    return null;
  }
  const match = /^(\d+)([smhd])$/u.exec(spec);
  if (match === null) {
    return undefined;
  }
  return Number(match[1]) * UNITS[match[2]!]!;
}

/** Minimal I/O seam: exists + read, so the reader is testable without a filesystem. */
export interface ConfigIo {
  exists(path: string): boolean;
  read(path: string): string;
}

/** Read and validate `<root>/sw.json`. Never throws. */
export function readSwConfig(root: string, io: ConfigIo, file = SW_CONFIG_FILE): SwConfigResult {
  const path = `${root}/${file}`;
  if (!io.exists(path)) {
    return { config: null, diagnostics: [] }; // explicit: no SW at all
  }

  const diagnostics: FudicDiagnostic[] = [];
  let parsed: SwConfigFile;
  try {
    parsed = JSON.parse(io.read(path)) as SwConfigFile;
  } catch (error) {
    return {
      config: null,
      diagnostics: [
        { code: FUD_SW_CONFIG_MALFORMED, message: `${file} is not valid JSON: ${(error as Error).message}`, file },
      ],
    };
  }
  if (parsed === null || typeof parsed !== 'object' || !Array.isArray(parsed.shell)) {
    return {
      config: null,
      diagnostics: [
        { code: FUD_SW_CONFIG_MALFORMED, message: `${file} must be an object with a "shell" array`, file },
      ],
    };
  }

  const resources: ResourceRule[] = [];
  for (const [name, rule] of Object.entries(parsed.resources ?? {})) {
    if (typeof rule?.pattern !== 'string' || !POLICIES.includes(rule.policy)) {
      diagnostics.push({
        code: FUD_SW_CONFIG_MALFORMED,
        message: `${file}: resource "${name}" needs a pattern and a valid policy`,
        file,
      });
      continue;
    }
    const ttl = parseTtl(rule.ttl);
    if (ttl === undefined) {
      diagnostics.push({
        code: FUD_TTL_INVALID,
        message: `${file}: resource "${name}" has an invalid ttl "${String(rule.ttl)}" (expected 30s/5m/2h/7d)`,
        file,
      });
      continue;
    }
    resources.push({
      pattern: rule.pattern,
      policy: rule.policy,
      ttl,
      ...(rule.maxEntries === undefined ? {} : { maxEntries: rule.maxEntries }),
    });
  }

  return {
    config: {
      shell: parsed.shell.filter((s): s is string => typeof s === 'string'),
      resources,
      dev: parsed.dev === 'preview' ? 'preview' : 'off',
    },
    diagnostics,
  };
}
