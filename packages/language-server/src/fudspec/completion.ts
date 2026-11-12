/**
 * Completion in a `.fudspec` (SDD-52 §4.4, SDD-82 §3.10). The indentation says what can be
 * written: a header or `criterion` at 0, a block at 2, a term or a line of the validator at 4,
 * and after either its next argument.
 *
 * What an argument offers comes from the workspace: a component tag after `component`, a route
 * after `page`; a tag or `role:` for an `element`; the names of the fixture after a fixture line,
 * the values of its `paths` after `path`, the project's routes after `url`, `go` and `then url`;
 * what the page or the flow can call after `called` and `sent`, and that function's arguments
 * after its name; the people already named after `as`.
 *
 * It reads the line as typed rather than the tree: half a line is exactly what completion is
 * asked about, and the parser would rightly call most of them broken.
 */

import {
  AS_LINE,
  FIXTURE_LINES,
  fixtureLineOf,
  normalizeTerm,
  type BlockKind,
  type FixtureLine,
  type HeaderKind,
  type RouteFile,
} from '@fudic/spec';
import {
  CompletionItemKind,
  InsertTextFormat,
  type CompletionItem,
  type CompletionList,
} from 'vscode-languageserver-protocol';
import { peopleOf, signatureOf, type SpecDocument } from './document.js';
import type { SpecHost } from './host.js';
import {
  asSnippet,
  criterionSnippet,
  fixtureLineSnippet,
  headerSnippet,
  siblingHeader,
  termSnippet,
  urlSnippet,
} from './snippets.js';

const HEADERS: readonly HeaderKind[] = ['component', 'page', 'flow'];
const CRITERION = 'criterion';
const BLOCKS = ['given', 'when', 'then'] as const;

/** One argument as the parser cuts them: runs of anything but blanks, with quoted runs whole. */
const ARGUMENT = /(?:[^\s"]|"(?:[^"\\]|\\.)*"?)+/gu;

/** The terms whose first argument is a URL of the app (SDD-82 §3.10). */
const URL_TERMS: ReadonlySet<string> = new Set(['when/go', 'then/url']);
/** The terms whose first argument is a function the page or the flow can call. */
const FUNCTION_TERMS: ReadonlySet<string> = new Set(['then/called', 'then/sent']);

function list(items: readonly CompletionItem[]): CompletionList {
  return { isIncomplete: false, items: [...items] };
}

function keyword(label: string): CompletionItem {
  return { label, kind: CompletionItemKind.Keyword };
}

/** A snippet item (SDD-53 §4.4): offered next to the keyword, never instead of it. */
function snippet(label: string, detail: string, insertText: string): CompletionItem {
  return { label, kind: CompletionItemKind.Snippet, detail, insertText, insertTextFormat: InsertTextFormat.Snippet };
}

/** Column 0: the headers and `criterion`, the whole criterion and, while the file has none, its header line. */
function topLevel(spec: SpecDocument, host: SpecHost): CompletionList {
  // In a file still without its header, that line is what comes first (SDD-53 criterion 14):
  // `page` beside a route, `flow` in the flows folder, `component` anywhere else.
  const first: CompletionItem[] = [];
  if (spec.file.header === undefined) {
    const kind = siblingHeader(spec, host)?.kind ?? 'component';
    first.push({ ...snippet(kind, `${kind} <${kind === 'component' ? 'tag' : kind === 'page' ? 'route' : 'name'}>`, headerSnippet(kind, spec, host)), preselect: true, sortText: '0' });
  }
  const items = [...first, ...[...HEADERS, CRITERION].map(keyword)];
  items.push(snippet(CRITERION, 'criterion <slug> given … then …', criterionSnippet(spec, host)));
  return list(items);
}

/** The block the line starting at `lineStart` is under, looking up to the criterion. */
function blockAbove(text: string, lineStart: number): BlockKind | undefined {
  const lines = text.slice(0, lineStart).split(/\r\n|\n|\r/u).reverse();
  for (const line of lines) {
    const block = /^ {2}(given|when|then)(?=\s|$)/u.exec(line);
    if (block !== null) return block[1] as BlockKind;
    // A line at column 0 that is not a comment closes the search: a criterion or a header.
    if (/^[^\s#]/u.test(line)) return undefined;
  }
  return undefined;
}

export function specCompletions(spec: SpecDocument, offset: number, host: SpecHost): CompletionList | undefined {
  const lineStart = Math.max(spec.text.lastIndexOf('\n', offset - 1), spec.text.lastIndexOf('\r', offset - 1)) + 1;
  const before = spec.text.slice(lineStart, offset);
  // Inside a comment nothing is offered.
  if (/(?:^|\s)#/u.test(before)) return undefined;

  const header = /^(component|page|flow)[ \t]+\S*$/u.exec(before);
  if (header !== null) return headerArgument(header[1] as HeaderKind, spec, host);
  if (/^\S*$/u.test(before)) return topLevel(spec, host);
  if (/^ {2}\S*$/u.test(before)) return list(BLOCKS.map(keyword));

  const block = blockAbove(spec.text, lineStart);
  if (block === undefined) return undefined;
  if (/^ {4}\S*$/u.test(before)) return lines(spec, block, host);

  if (!/^ {4}\S+\s/u.test(before)) return undefined;
  const body = before.slice(4);
  const gap = body.search(/\s/u);
  const name = body.slice(0, gap);
  const rest = body.slice(gap).trimStart();
  const written = rest.match(ARGUMENT) ?? [];
  // The argument under the cursor: the next one after a blank, the last one while it is typed.
  const position = /\s$/u.test(rest) || rest === '' ? written.length : written.length - 1;

  if (name === AS_LINE) return position === 0 ? people(spec) : undefined;
  const line = fixtureLineOf(name, block, host.terms(spec.path));
  if (line !== undefined) return fixtureArgument(spec, host, line, position);
  return argument(spec, host, { block, name, position, written });
}

/** After a header keyword: the component tags, or the project's routes; a flow is named freely. */
function headerArgument(kind: HeaderKind, spec: SpecDocument, host: SpecHost): CompletionList | undefined {
  if (kind === 'component') return list(host.componentTags().map((tag) => ({ label: tag, kind: CompletionItemKind.Class })));
  if (kind === 'flow') return undefined;
  return list(host.context(spec.path).routes().map((route) => ({ label: route.route, kind: CompletionItemKind.File, detail: route.path })));
}

/** Column 4: the terms of the block, every layer, one per name; the fixture lines of the spec's kind in `given`; `as` anywhere. */
function lines(spec: SpecDocument, block: BlockKind, host: SpecHost): CompletionList {
  const items: CompletionItem[] = host
    .terms(spec.path)
    .list(block)
    .map((module) => ({
      label: module.name,
      kind: CompletionItemKind.Function,
      labelDetails: { description: module.layer },
      detail: signatureOf(module),
      // One tab stop per parameter (SDD-53 §4.4).
      insertText: termSnippet(module, host),
      insertTextFormat: InsertTextFormat.Snippet,
      ...(module.describe !== undefined ? { documentation: module.describe } : {}),
    }));
  if (block === 'given') {
    // Without a header yet, every line: the header the file gets decides which stay.
    const kind = spec.file.header?.header;
    for (const [name, line] of Object.entries(FIXTURE_LINES)) {
      if (kind !== undefined && !line.kinds.includes(kind)) continue;
      items.push({
        label: name,
        kind: CompletionItemKind.Keyword,
        detail: `${name} <${line.param}>${line.many ? '+' : ''}`,
        insertText: fixtureLineSnippet(name, spec, host),
        insertTextFormat: InsertTextFormat.Snippet,
      });
    }
  }
  items.push({ label: AS_LINE, kind: CompletionItemKind.Keyword, detail: 'as <who>', insertText: asSnippet(spec), insertTextFormat: InsertTextFormat.Snippet });
  return list(items);
}

function people(spec: SpecDocument): CompletionList {
  return list(peopleOf(spec).map((who) => ({ label: who, kind: CompletionItemKind.Variable })));
}

/** After a fixture line: the names of its group, the values of `paths`, or the URLs the spec can open. */
function fixtureArgument(spec: SpecDocument, host: SpecHost, line: FixtureLine, position: number): CompletionList | undefined {
  if (position > 0 && !line.many) return undefined;
  const subject = host.subject(spec.path, spec.file);
  if (line.param === 'url') return urls(spec, host, subject.kind === 'page' ? subject.page : undefined);
  const fixtures = host.fixturesOf(subject);
  if (fixtures === undefined) return undefined;
  const group = line.param === 'value' ? fixtures.paths : line.group === undefined ? fixtures : fixtures[line.group];
  if (group === undefined) return undefined;
  return list(group.names.map((name) => ({ label: name.text, kind: CompletionItemKind.Value, detail: fixtures.path })));
}

/** The URLs of the project's routes; only the page's own when `page` is given. */
function urls(spec: SpecDocument, host: SpecHost, page?: RouteFile): CompletionList {
  const routes = page === undefined ? host.context(spec.path).routes() : [page];
  return list(
    routes.map((route) => ({
      label: route.pattern,
      kind: CompletionItemKind.File,
      detail: route.path,
      insertText: urlSnippet(route),
      insertTextFormat: InsertTextFormat.Snippet,
    })),
  );
}

interface Typed {
  readonly block: BlockKind;
  readonly name: string;
  readonly position: number;
  /** The arguments written so far, as typed. */
  readonly written: readonly string[];
}

/** After a term: what its next parameter takes, when there is a closed list to offer. */
function argument(spec: SpecDocument, host: SpecHost, typed: Typed): CompletionList | undefined {
  const term = normalizeTerm(typed.name);
  const key = `${typed.block}/${term}`;
  if (typed.position === 0 && URL_TERMS.has(key)) return urls(spec, host);
  if (FUNCTION_TERMS.has(key) && typed.position <= 1) return callable(spec, host, typed);

  const param = host.terms(spec.path).resolve(typed.block, term)?.params[typed.position];
  if (param?.type !== 'element') return undefined;
  const tags = host.componentTags().map((tag) => ({ label: tag, kind: CompletionItemKind.Class, detail: param.name }));
  return list([...tags, { label: 'role:', kind: CompletionItemKind.Keyword, detail: 'role:<role>/"<name>"' }]);
}

/** `called`/`sent`: the functions in reach, then (for `sent`) the arguments of the one named. */
function callable(spec: SpecDocument, host: SpecHost, typed: Typed): CompletionList | undefined {
  const functions = host.functionsOf(spec.path, host.subject(spec.path, spec.file));
  if (functions === 'unknown') return undefined;
  if (typed.position === 0) {
    return list(functions.map((fn) => ({ label: fn.name, kind: CompletionItemKind.Function, detail: `${fn.name}(${fn.args.join(', ')})` })));
  }
  if (normalizeTerm(typed.name) !== 'sent') return undefined;
  const fn = functions.find((f) => f.name === typed.written[0]);
  return fn === undefined ? undefined : list(fn.args.map((arg) => ({ label: arg, kind: CompletionItemKind.Field, detail: fn.name })));
}
