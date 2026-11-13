/**
 * The `Content-Security-Policy` of a `.headers` file: its directives and sources with where each
 * one is written, the form of every source, the placeholders, and what weakens the page policy.
 *
 * A source only weakens the policy if the browser uses it: behind `'strict-dynamic'` a browser
 * ignores hosts and schemes, and behind a nonce it ignores `'unsafe-inline'`. That is what lets the
 * template keep its fallbacks for old browsers without a warning.
 */

import { FUD1543, FUD1544, FUD1546, FUD1547, type FileDiagnostic, type Span } from '@fudic/diagnostics';
import { partsOf, wordsOf, type Piece, type ValueCtx } from './segments.js';

/** The placeholders a value may hold; each is filled per response by whoever answers. */
export const PLACEHOLDERS: readonly string[] = ['nonce'];

/** The only form `{nonce}` takes: a CSP source. */
export const NONCE_SOURCE = "'nonce-{nonce}'";

/** One directive as written. */
export interface CspDirective {
  /** Lower case. */
  readonly name: string;
  /** The span of the name. */
  readonly span: Span;
  readonly sources: readonly Piece[];
}

/** A Content-Security-Policy as written. */
export interface CspPolicy {
  readonly directives: readonly CspDirective[];
  /** The span of the header's name, for what is missing from it. */
  readonly span: Span;
}

/** The directives whose value is a source list. */
const SOURCE_LISTS: ReadonlySet<string> = new Set([
  'default-src',
  'child-src',
  'connect-src',
  'font-src',
  'frame-src',
  'img-src',
  'manifest-src',
  'media-src',
  'object-src',
  'script-src',
  'script-src-elem',
  'script-src-attr',
  'style-src',
  'style-src-elem',
  'style-src-attr',
  'worker-src',
  'fenced-frame-src',
  'base-uri',
  'form-action',
  'frame-ancestors',
]);

/** Every CSP3 directive a browser reads. */
export const CSP_DIRECTIVES: readonly string[] = [
  ...SOURCE_LISTS,
  'sandbox',
  'report-uri',
  'report-to',
  'require-trusted-types-for',
  'trusted-types',
  'upgrade-insecure-requests',
  'webrtc',
];

const KNOWN_DIRECTIVES: ReadonlySet<string> = new Set(CSP_DIRECTIVES);

/** The keywords of a source list, quotes included. */
export const CSP_KEYWORDS: readonly string[] = [
  "'self'",
  "'none'",
  "'unsafe-inline'",
  "'unsafe-eval'",
  "'strict-dynamic'",
  "'unsafe-hashes'",
  "'report-sample'",
  "'wasm-unsafe-eval'",
  "'inline-speculation-rules'",
];

const HASH = /^'sha(?:256|384|512)-[A-Za-z0-9+/_-]+={0,2}'$/u;
const SCHEME = /^[a-z][a-z0-9+.-]*:$/iu;
const HOST = /^(?:[a-z][a-z0-9+.-]*:\/\/)?(?:\*|(?:\*\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*)(?::(?:\d+|\*))?(?:\/[^\s;,']*)?$/iu;
const SOURCE = "a CSP source: 'self', 'none', a scheme like https:, a host, 'nonce-{nonce}' or a hash";

/** The directives of a CSP value as written. */
export function parseCsp(ctx: Pick<ValueCtx, 'segments' | 'nameSpan'>): CspPolicy {
  const directives = partsOf(ctx.segments, ';').map((part) => {
    const [name, ...sources] = wordsOf(part);
    return { name: name!.text.toLowerCase(), span: name!.span, sources };
  });
  return { directives, span: ctx.nameSpan };
}

/** The first directive called `name`: a browser ignores a repeated one. */
export function directiveOf(policy: CspPolicy, name: string): CspDirective | undefined {
  return policy.directives.find((d) => d.name === name);
}

/** Every check of a CSP that needs no build. */
export function checkCsp(ctx: ValueCtx): readonly FileDiagnostic[] {
  const policy = parseCsp(ctx);
  const out: FileDiagnostic[] = [];
  for (const directive of policy.directives) {
    if (!KNOWN_DIRECTIVES.has(directive.name)) {
      out.push(FUD1544({ file: ctx.file, span: directive.span, directive: directive.name }));
      continue;
    }
    const plain = directive.sources.filter((source) => !holdsPlaceholder(ctx, directive, source, out));
    out.push(...sourcesOf(ctx, directive, plain));
  }
  if (ctx.kind === 'page') out.push(...weaknesses(ctx.file, policy));
  return out;
}

/** Whether `source` holds `{…}`, reporting it unless it is `'nonce-{nonce}'` where it belongs. */
function holdsPlaceholder(ctx: ValueCtx, directive: CspDirective, source: Piece, out: FileDiagnostic[]): boolean {
  const names = [...source.text.matchAll(/\{([^{}]*)\}/gu)].map((m) => m[1]!);
  if (names.length === 0) return false;
  const at = { file: ctx.file, span: source.span, text: source.text };
  const unknown = names.find((name) => !PLACEHOLDERS.includes(name));
  if (unknown !== undefined) out.push(FUD1546({ ...at, text: `{${unknown}}`, problem: 'unknown' }));
  else if (ctx.kind !== 'page') out.push(FUD1546({ ...at, problem: 'file' }));
  else if (source.text !== NONCE_SOURCE || !SOURCE_LISTS.has(directive.name)) out.push(FUD1546({ ...at, problem: 'misplaced' }));
  return true;
}

/** The form of each source of `directive`, by what kind of directive it is. */
function sourcesOf(ctx: ValueCtx, directive: CspDirective, sources: readonly Piece[]): readonly FileDiagnostic[] {
  const wrong = (source: Piece, expected: string): FileDiagnostic =>
    FUD1543({ file: ctx.file, span: source.span, name: ctx.entry.name, value: source.text, expected });
  if (SOURCE_LISTS.has(directive.name)) {
    return sources.flatMap((source): FileDiagnostic[] => {
      if (/^'nonce-/u.test(source.text)) return [FUD1546({ file: ctx.file, span: source.span, text: source.text, problem: 'literal' })];
      if (!isSource(source.text)) return [wrong(source, SOURCE)];
      if (source.text === "'none'" && sources.length > 1) return [wrong(source, "'none' alone: it cannot be combined with other sources")];
      return [];
    });
  }
  const accepts = TOKENS[directive.name];
  return accepts === undefined ? [] : sources.filter((s) => !accepts.test.test(s.text)).map((s) => wrong(s, accepts.expected));
}

/** The directives whose words are not sources, and what each accepts. */
const TOKENS: Readonly<Record<string, { readonly test: RegExp; readonly expected: string }>> = {
  'require-trusted-types-for': { test: /^'script'$/u, expected: "'script'" },
  'trusted-types': {
    test: /^(?:'none'|'allow-duplicates'|\*|[A-Za-z0-9\-#=_/@.%]+)$/u,
    expected: "policy names, 'allow-duplicates' or 'none'",
  },
  sandbox: { test: /^allow-[a-z-]+$/u, expected: 'allow-* tokens, such as allow-scripts' },
  'upgrade-insecure-requests': { test: /^(?!)/u, expected: 'nothing: the directive takes no value' },
  webrtc: { test: /^'(?:allow|block)'$/u, expected: "'allow' or 'block'" },
};

function isSource(text: string): boolean {
  return text === '*' || CSP_KEYWORDS.includes(text) || HASH.test(text) || SCHEME.test(text) || (!text.startsWith("'") && HOST.test(text));
}

/** What the browser does use and lets in more than a page needs. */
function weaknesses(file: string, policy: CspPolicy): readonly FileDiagnostic[] {
  const out: FileDiagnostic[] = [];
  const script = directiveOf(policy, 'script-src') ?? directiveOf(policy, 'default-src');
  if (script !== undefined) {
    const texts = script.sources.map((s) => s.text);
    const strict = texts.includes("'strict-dynamic'");
    const nonced = texts.some((t) => t === NONCE_SOURCE || HASH.test(t));
    for (const source of script.sources) {
      const t = source.text;
      const loose = t === "'unsafe-eval'" || (t === "'unsafe-inline'" && !nonced) || (!strict && (t === '*' || !t.startsWith("'")));
      if (loose) out.push(FUD1547({ file, span: source.span, directive: script.name, source: t }));
    }
  }
  const object = directiveOf(policy, 'object-src');
  // An empty source list matches nothing, like 'none'.
  const none = (d: CspDirective | undefined): boolean =>
    d !== undefined && d.sources.every((s) => s.text === "'none'");
  if (object === undefined && !none(directiveOf(policy, 'default-src'))) {
    out.push(FUD1547({ file, span: policy.span, directive: 'object-src' }));
  } else if (object !== undefined && !none(object)) {
    const first = object.sources.find((s) => s.text !== "'none'")!;
    out.push(FUD1547({ file, span: first.span, directive: 'object-src', source: first.text }));
  }
  for (const name of ['base-uri', 'frame-ancestors']) {
    if (directiveOf(policy, name) === undefined) out.push(FUD1547({ file, span: policy.span, directive: name }));
  }
  return out;
}
