/**
 * Hover and go-to-definition in a `.fudspec` (SDD-52 §4.4, SDD-82 §3.10). Both ask the same
 * question — what the cursor is on — and answer it differently: the hover says what it is, the
 * definition opens the file behind it.
 *
 * What has a file behind it: a term (its `.js`, the one that won across the layers), the header
 * (the component's or the page's `.fud`), a name of a fixture line (its key in the `.fixture.ts`,
 * a value of `paths` included), a URL of `url`, `go` or `then url` (the `.fud` of the route that
 * answers it), and a function of `called` or `sent` (its name in the `.fudapi`).
 */

import type { Span } from '@fudic/diagnostics';
import {
  AS_LINE,
  FIXTURE_LINES,
  fixtureLineOf,
  matchesPattern,
  normalizeTerm,
  type Arg,
  type BlockKind,
  type ComponentInfo,
  type FunctionInfo,
  type Name,
  type RouteFile,
  type TermLine,
  type TermModule,
} from '@fudic/spec';
import type { Hover, LocationLink, Range } from 'vscode-languageserver-protocol';
import { pathToUri } from '../uri.js';
import { rangeIn, signatureOf, spanRange, termLines, touches, type SpecDocument } from './document.js';
import type { SpecHost, SpecSubject } from './host.js';

type Target =
  | { readonly kind: 'term'; readonly span: Span; readonly module: TermModule }
  | { readonly kind: 'component'; readonly span: Span; readonly component: ComponentInfo }
  | { readonly kind: 'route'; readonly span: Span; readonly route: RouteFile }
  | { readonly kind: 'fixture'; readonly span: Span; readonly path: string; readonly line: string; readonly name: Name }
  | { readonly kind: 'function'; readonly span: Span; readonly fn: FunctionInfo; readonly field?: string };

/** The terms whose first argument is a URL of the app, and those whose first is a function. */
const URL_TERMS: ReadonlySet<string> = new Set(['when/go', 'then/url']);
const FUNCTION_TERMS: ReadonlySet<string> = new Set(['then/called', 'then/sent']);

/** A bare or quoted argument: what a name, a value or a URL is written as. */
type TextArg = Exclude<Arg, { readonly kind: 'role' }>;
const textOf = (arg: Arg | undefined): TextArg | undefined => (arg === undefined || arg.kind === 'role' ? undefined : arg);

function headerTarget(subject: SpecSubject): Target | undefined {
  switch (subject.kind) {
    case 'component':
      return subject.component === undefined ? undefined : { kind: 'component', span: subject.name.span, component: subject.component };
    case 'page':
      return subject.page === undefined ? undefined : { kind: 'route', span: subject.name.span, route: subject.page };
    default:
      return undefined;
  }
}

function targetAt(spec: SpecDocument, offset: number, host: SpecHost): Target | undefined {
  const subject = host.subject(spec.path, spec.file);
  if (subject.kind !== undefined && touches(subject.name.span, offset)) return headerTarget(subject);

  const placed = termLines(spec.file).find(({ term }) => touches(term.span, offset));
  if (placed === undefined) return undefined;
  const { block, term } = placed;
  if (term.name.text === AS_LINE) return undefined;
  if (fixtureLineOf(term.name.text, block, host.terms(spec.path)) !== undefined) return lineTarget(spec, host, subject, term, offset);
  if (touches(term.name.span, offset)) {
    const module = host.terms(spec.path).resolve(block, normalizeTerm(term.name.text));
    return module === undefined ? undefined : { kind: 'term', span: term.name.span, module };
  }
  return argumentTarget(spec, host, subject, { block, term, offset });
}

/**
 * A fixture line: the name under the cursor, or the first one while the cursor is on the line's
 * own word — the whole line is then what the hover covers.
 */
function lineTarget(spec: SpecDocument, host: SpecHost, subject: SpecSubject, term: TermLine, offset: number): Target | undefined {
  const touched = term.args.find((a) => touches(a.span, offset));
  const arg = textOf(touched ?? term.args[0]);
  if (arg === undefined) return undefined;
  const span = touched === undefined ? term.span : arg.span;
  const line = term.name.text;
  if (line === 'url') {
    const route = routeOf(spec, host, arg.text);
    return route === undefined ? undefined : { kind: 'route', span, route };
  }
  const fixtures = host.fixturesOf(subject);
  const shape = FIXTURE_LINES[line]!;
  const group = line === 'path' ? fixtures?.paths : shape.group === undefined ? fixtures : fixtures?.[shape.group];
  const name = group?.names.find((n) => n.text === arg.text);
  return fixtures === undefined || name === undefined ? undefined : { kind: 'fixture', span, path: fixtures.path, line, name };
}

/** The first route of the project that answers `url`. */
function routeOf(spec: SpecDocument, host: SpecHost, url: string): RouteFile | undefined {
  return host
    .context(spec.path)
    .routes()
    .find((r) => matchesPattern(r.pattern, url));
}

interface At {
  readonly block: BlockKind;
  readonly term: TermLine;
  readonly offset: number;
}

/** An argument of a term: the URL of `go` and `then url`, the function and the field of `called` and `sent`. */
function argumentTarget(spec: SpecDocument, host: SpecHost, subject: SpecSubject, at: At): Target | undefined {
  const key = `${at.block}/${normalizeTerm(at.term.name.text)}`;
  const index = at.term.args.findIndex((a) => touches(a.span, at.offset));
  const arg = textOf(at.term.args[index]);
  if (arg === undefined) return undefined;
  if (URL_TERMS.has(key) && index === 0) {
    const route = routeOf(spec, host, arg.text);
    return route === undefined ? undefined : { kind: 'route', span: arg.span, route };
  }
  if (!FUNCTION_TERMS.has(key) || index > 1 || (index === 1 && key !== 'then/sent')) return undefined;
  const functions = host.functionsOf(spec.path, subject);
  const fn = functions === 'unknown' ? undefined : functions.find((f) => f.name === textOf(at.term.args[0])?.text);
  if (fn === undefined) return undefined;
  return index === 0 ? { kind: 'function', span: arg.span, fn } : { kind: 'function', span: arg.span, fn, field: arg.text };
}

function markdownOf(target: Target): string {
  switch (target.kind) {
    case 'term': {
      const { module } = target;
      const describe = module.describe === undefined ? '' : `\n\n\`\`\`js\n${module.describe}\n\`\`\``;
      return `\`\`\`fudspec\n${signatureOf(module)}\n\`\`\`${describe}\n\n${module.layer} · \`${module.path}\``;
    }
    case 'component':
      return `\`<${target.component.tag}>\`\n\n\`${target.component.path}\``;
    case 'route':
      return `page \`${target.route.route}\` · \`${target.route.pattern}\`\n\n\`${target.route.path}\``;
    case 'fixture':
      return `${target.line} \`${target.name.text}\`\n\n\`${target.path}\``;
    case 'function': {
      const signature = `${target.fn.name}(${target.fn.args.join(', ')})`;
      const field = target.field === undefined ? '' : `argument \`${target.field}\` of `;
      return `${field}\`${signature}\`\n\n\`${target.fn.path}\``;
    }
  }
}

export function specHover(spec: SpecDocument, offset: number, host: SpecHost): Hover | undefined {
  const target = targetAt(spec, offset, host);
  if (target === undefined) return undefined;
  return {
    contents: { kind: 'markdown', value: markdownOf(target) },
    range: spanRange(spec, target.span),
  };
}

const TOP: Range = { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };

/** The file a target opens, and where in it: a whole file at the top, a name at its place. */
function destination(spec: SpecDocument, target: Target, host: SpecHost): readonly [string, Range] {
  const read = (path: string): string | undefined => host.read(path);
  switch (target.kind) {
    case 'term':
      return [target.module.path, TOP];
    case 'component':
      return [target.component.path, TOP];
    case 'route':
      return [target.route.path, TOP];
    case 'fixture':
      return [target.path, rangeIn(spec, target.path, target.name.span, read)];
    case 'function':
      return [target.fn.path, rangeIn(spec, target.fn.path, target.fn.span, read)];
  }
}

export function specDefinition(spec: SpecDocument, offset: number, host: SpecHost): LocationLink[] | undefined {
  const target = targetAt(spec, offset, host);
  if (target === undefined) return undefined;
  const [path, range] = destination(spec, target, host);
  return [
    {
      targetUri: pathToUri(path).toString(),
      targetRange: range,
      targetSelectionRange: range,
      originSelectionRange: spanRange(spec, target.span),
    },
  ];
}
