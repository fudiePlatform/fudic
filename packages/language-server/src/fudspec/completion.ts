/**
 * Completion in a `.fudspec` (SDD-52 §4.4). The indentation says what can be written: a keyword
 * at 0 and at 2, a term of the block at 4, and after a term its next argument — a component tag
 * or `role:` for an `element`, a fixture name after `props`.
 *
 * It reads the line as typed rather than the tree: half a line is exactly what completion is
 * asked about, and the parser would rightly call most of them broken.
 */

import { normalizeTerm, type BlockKind } from '@fudic/spec';
import {
  CompletionItemKind,
  InsertTextFormat,
  type CompletionItem,
  type CompletionList,
} from 'vscode-languageserver-protocol';
import { signatureOf, type SpecDocument } from './document.js';
import type { SpecHost } from './host.js';
import { componentSnippet, criterionSnippet, propsSnippet, termSnippet } from './snippets.js';

const TOP_LEVEL = ['component', 'criterion'] as const;
const BLOCKS = ['given', 'when', 'then'] as const;
const PROPS = 'props';

/** One argument as the parser cuts them: runs of anything but blanks, with quoted runs whole. */
const ARGUMENT = /(?:[^\s"]|"(?:[^"\\]|\\.)*"?)+/gu;

function keywords(words: readonly string[]): CompletionList {
  return { isIncomplete: false, items: words.map(keyword) };
}

function keyword(label: string): CompletionItem {
  return { label, kind: CompletionItemKind.Keyword };
}

/** A snippet item (SDD-53 §4.4): offered next to the keyword, never instead of it. */
function snippet(label: string, detail: string, insertText: string): CompletionItem {
  return { label, kind: CompletionItemKind.Snippet, detail, insertText, insertTextFormat: InsertTextFormat.Snippet };
}

/** Column 0: the two keywords, the whole criterion and, while the file has none, the component line. */
function topLevel(spec: SpecDocument, host: SpecHost): CompletionList {
  const items = TOP_LEVEL.map(keyword);
  if (spec.file.component === undefined) {
    items.push({ ...snippet('component', 'component <tag>', componentSnippet(spec, host)), preselect: true });
  }
  items.push(snippet('criterion', 'criterion <slug> given … then …', criterionSnippet(spec, host)));
  return { isIncomplete: false, items };
}

/** The block the line starting at `lineStart` is under, looking up to the criterion. */
function blockAbove(text: string, lineStart: number): BlockKind | undefined {
  const lines = text.slice(0, lineStart).split(/\r\n|\n|\r/u).reverse();
  for (const line of lines) {
    const block = /^ {2}(given|when|then)(?=\s|$)/u.exec(line);
    if (block !== null) return block[1] as BlockKind;
    // A line at column 0 that is not a comment closes the search: a criterion or a component.
    if (/^[^\s#]/u.test(line)) return undefined;
  }
  return undefined;
}

export function specCompletions(spec: SpecDocument, offset: number, host: SpecHost): CompletionList | undefined {
  const lineStart = Math.max(spec.text.lastIndexOf('\n', offset - 1), spec.text.lastIndexOf('\r', offset - 1)) + 1;
  const before = spec.text.slice(lineStart, offset);
  // Inside a comment nothing is offered.
  if (/(?:^|\s)#/u.test(before)) return undefined;

  if (/^\S*$/u.test(before)) return topLevel(spec, host);
  if (/^ {2}\S*$/u.test(before)) return keywords(BLOCKS);

  const block = blockAbove(spec.text, lineStart);
  if (block === undefined) return undefined;
  if (/^ {4}\S*$/u.test(before)) return terms(spec, block, host);

  if (!/^ {4}\S+\s/u.test(before)) return undefined;
  const body = before.slice(4);
  const gap = body.search(/\s/u);
  const name = body.slice(0, gap);
  const rest = body.slice(gap).trimStart();
  const written = rest.match(ARGUMENT) ?? [];
  // The argument under the cursor: the next one after a blank, the last one while it is typed.
  const position = /\s$/u.test(rest) || rest === '' ? written.length : written.length - 1;
  return name === PROPS ? fixtureNames(spec, position, host) : argument(spec, block, name, position, host);
}

/** The terms of the block, every layer, one per name, with the layer in sight. */
function terms(spec: SpecDocument, block: BlockKind, host: SpecHost): CompletionList {
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
    items.push({
      label: PROPS,
      kind: CompletionItemKind.Keyword,
      detail: 'props <fixture>',
      insertText: propsSnippet(spec, host),
      insertTextFormat: InsertTextFormat.Snippet,
    });
  }
  return { isIncomplete: false, items };
}

/** After `props`: the keys of the component's fixture file. */
function fixtureNames(spec: SpecDocument, position: number, host: SpecHost): CompletionList | undefined {
  const tag = spec.file.component?.tag?.text;
  const fixtures = position === 0 && tag !== undefined ? host.fixtures(tag) : undefined;
  if (fixtures === undefined) return undefined;
  return {
    isIncomplete: false,
    items: fixtures.names.map((name) => ({ label: name.text, kind: CompletionItemKind.Value, detail: fixtures.path })),
  };
}

/** After a term: what its next parameter takes. Only `element` has a closed list to offer. */
function argument(
  spec: SpecDocument,
  block: BlockKind,
  name: string,
  position: number,
  host: SpecHost,
): CompletionList | undefined {
  const param = host.terms(spec.path).resolve(block, normalizeTerm(name))?.params[position];
  if (param?.type !== 'element') return undefined;
  const tags = host.componentTags().map((tag) => ({ label: tag, kind: CompletionItemKind.Class, detail: param.name }));
  return {
    isIncomplete: false,
    items: [...tags, { label: 'role:', kind: CompletionItemKind.Keyword, detail: 'role:<role>/"<name>"' }],
  };
}
