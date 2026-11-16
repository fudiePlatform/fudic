/**
 * What fudic's own output needs from a policy, compared with what the policy lets in.
 *
 * There is no CSP of fudic's anywhere: each piece that emits something declares what it puts in
 * the page, the build gathers what was really emitted, and this module reads the file's policy as
 * a browser does (CSP3: the effective directive, `default-src` behind it, `'unsafe-inline'` ignored
 * beside a nonce or a hash). A piece that stops emitting stops needing, and what the policy kept
 * only for it becomes `FUD1556`, without touching anything else.
 */

import { FUD1545, FUD1548, FUD1556, type FileDiagnostic, type Span } from '@fudic/diagnostics';
import { directiveOf, NONCE_SOURCE, type CspDirective, type CspPolicy } from './csp.js';
import { HEADERS_FILES } from './parse.js';

/**
 * What one piece of fudic puts in a page or in the Service Worker, and what emits it, in words for
 * a message (`the style polyfill`).
 *
 * - `inline-script`, `inline-style`: an element with its code inside.
 * - `script`: an element that loads a script from the app (`<script src>`, `modulepreload`, `importmap`).
 * - `eval`: code that evaluates text (`new Function`).
 * - `policy`: a Trusted Types policy, by its name.
 */
export type CspNeed =
  | { readonly loads: 'inline-script' | 'inline-style' | 'script' | 'eval'; readonly piece: string }
  | { readonly loads: 'policy'; readonly policy: string; readonly piece: string };

/** What a policy says about fudic's needs: something to add, or something to remove. */
export interface NeedFinding {
  readonly diagnostic: FileDiagnostic;
  readonly action: 'add' | 'remove';
  readonly directive: string;
  readonly source: string;
  /** Where the source goes (the directive) or where it is (the source). */
  readonly span: Span;
}

/** The names of Trusted Types policies fudic creates. */
const FUDIC_POLICIES: readonly string[] = ['fudic'];

/** Where the browser looks for each kind of need, most specific first. */
const CHAINS: Readonly<Record<'inline-script' | 'inline-style' | 'script' | 'eval', readonly string[]>> = {
  'inline-script': ['script-src-elem', 'script-src', 'default-src'],
  script: ['script-src-elem', 'script-src', 'default-src'],
  'inline-style': ['style-src-elem', 'style-src', 'default-src'],
  eval: ['script-src', 'default-src'],
};

const HASH = /^'sha(?:256|384|512)-/u;

/** How one need fares: let in (and by what fudic source, if one), or blocked and what would let it in. */
type Verdict =
  | { readonly ok: true; readonly directive?: CspDirective; readonly by?: string }
  | { readonly ok: false; readonly directive: CspDirective; readonly source: string };

/**
 * The needs of `kind`'s output against its policy: `FUD1545` (page) or `FUD1548` (Service Worker)
 * for what does not get in, and `FUD1556` for what the policy keeps for fudic and nothing needs.
 * `policy` undefined is a file without a CSP: everything gets in and nothing is kept.
 */
export function checkNeeds(
  kind: 'page' | 'sw',
  policy: CspPolicy | undefined,
  needs: readonly CspNeed[],
  file: string,
): readonly NeedFinding[] {
  if (policy === undefined) return [];
  const out: NeedFinding[] = [];
  const reported = new Set<string>();
  const used = new Set<string>();
  for (const need of needs) {
    const verdict = judge(policy, need);
    if (verdict.ok) {
      if (verdict.by !== undefined) used.add(`${verdict.directive!.name} ${verdict.by}`);
      continue;
    }
    const { directive, source } = verdict;
    const key = `${directive.name} ${source} ${need.piece}`;
    if (reported.has(key)) continue;
    reported.add(key);
    const at = { file, span: directive.span, directive: directive.name, source, piece: need.piece };
    out.push({ diagnostic: kind === 'page' ? FUD1545(at) : FUD1548(at), action: 'add', directive: directive.name, source, span: directive.span });
  }
  for (const directive of policy.directives) {
    for (const source of directive.sources) {
      if (!keptForFudic(kind, directive.name, source.text) || used.has(`${directive.name} ${source.text}`)) continue;
      const at = { file, span: source.span, directive: directive.name, source: source.text };
      out.push({ diagnostic: FUD1556(at), action: 'remove', directive: directive.name, source: source.text, span: source.span });
    }
  }
  return out;
}

/** The sources a policy only has because fudic asked: the ones `FUD1556` looks at, and no other. */
function keptForFudic(kind: 'page' | 'sw', directive: string, source: string): boolean {
  if (kind === 'sw') return source === "'unsafe-eval'";
  return source === NONCE_SOURCE || (directive === 'trusted-types' && FUDIC_POLICIES.includes(source));
}

function judge(policy: CspPolicy, need: CspNeed): Verdict {
  if (need.loads === 'policy') return judgePolicy(directiveOf(policy, 'trusted-types'), need.policy);
  const directive = CHAINS[need.loads].map((name) => directiveOf(policy, name)).find((d) => d !== undefined);
  if (directive === undefined) return { ok: true };
  const sources = directive.sources.map((s) => s.text);
  const nonce = sources.includes(NONCE_SOURCE);
  const blocked = (source: string): Verdict => ({ ok: false, directive, source });
  switch (need.loads) {
    case 'eval':
      return sources.includes("'unsafe-eval'") ? { ok: true, directive, by: "'unsafe-eval'" } : blocked("'unsafe-eval'");
    case 'script': {
      if (sources.includes("'strict-dynamic'")) return nonce ? { ok: true, directive, by: NONCE_SOURCE } : blocked(NONCE_SOURCE);
      if (sources.some((s) => s === "'self'" || s === '*' || s === 'https:' || s === 'http:')) return { ok: true };
      return nonce ? { ok: true, directive, by: NONCE_SOURCE } : blocked("'self'");
    }
    default: {
      if (nonce) return { ok: true, directive, by: NONCE_SOURCE };
      // Beside a hash (or 'strict-dynamic' for scripts) a browser ignores 'unsafe-inline'.
      const ignored = sources.some((s) => HASH.test(s)) || (need.loads === 'inline-script' && sources.includes("'strict-dynamic'"));
      if (!ignored && sources.includes("'unsafe-inline'")) return { ok: true };
      return blocked(need.loads === 'inline-style' && !ignored ? "'unsafe-inline'" : NONCE_SOURCE);
    }
  }
}

/** A Trusted Types policy is created only if `trusted-types` names it, or there is no such directive. */
function judgePolicy(directive: CspDirective | undefined, name: string): Verdict {
  if (directive === undefined) return { ok: true };
  const names = directive.sources.map((s) => s.text);
  if (names.includes(name)) return { ok: true, directive, by: name };
  return names.includes('*') ? { ok: true } : { ok: false, directive, source: name };
}

/** Where the build leaves what its output needs, for the editor (SDD-84 §3.4), from the app's root. */
export const CSP_NEEDS_FILE = '.fudic/csp-needs.json';

/** The kinds of need a piece declares without a name. */
const LOADS: ReadonlySet<string> = new Set(['inline-script', 'inline-style', 'script', 'eval']);

/**
 * What `.fudic/csp-needs.json` says the output of `page.headers` and `sw.headers` needs, by kind.
 * A file the build has not written yet, or one that does not read, says nothing: the editor keeps
 * quiet rather than guess (§8.1, decision 24). Never throws.
 */
export function readCspNeeds(text: string | undefined): Partial<Record<'page' | 'sw', readonly CspNeed[]>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text ?? 'null');
  } catch {
    return {};
  }
  if (typeof parsed !== 'object' || parsed === null) return {};
  const out: Partial<Record<'page' | 'sw', readonly CspNeed[]>> = {};
  for (const kind of ['page', 'sw'] as const) {
    const list = (parsed as Record<string, unknown>)[HEADERS_FILES[kind]];
    if (Array.isArray(list)) out[kind] = list.filter(isNeed);
  }
  return out;
}

function isNeed(value: unknown): value is CspNeed {
  if (typeof value !== 'object' || value === null) return false;
  const need = value as Record<string, unknown>;
  if (typeof need['piece'] !== 'string') return false;
  return need['loads'] === 'policy' ? typeof need['policy'] === 'string' : LOADS.has(String(need['loads']));
}
