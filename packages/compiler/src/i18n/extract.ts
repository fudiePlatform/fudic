/**
 * `extractMessages` and `extractScriptMessages` — what `fudic translate` asks of a source
 * (SDD-58 §3.3, §4.9, §5).
 *
 * The file is parsed with the compiler's own pipeline and its JS goes to Oxc in ONE batch, the
 * view's fragments and `@code` together. Never throws: a broken `.fud` gives the messages of
 * whatever parsed, with the parse's diagnostics beside them.
 */

import { parseSync } from 'oxc-parser';
import { atConstructs } from '../constructs.js';
import type { StructuredDocument } from '../document/index.js';
import { structureDocument } from '../document/index.js';
import { parseDocument } from '../html/index.js';
import { JsBatch, type FragmentId, type JsFragmentKind, type OxcNode } from '../oxc/index.js';
import { documentRoots, walk } from '../semantic/index.js';
import { keyExpression } from '../control/index.js';
import type { Diagnostic, ParseResult, Span } from '../types/index.js';
import { withDiagnostics } from '../types/index.js';
import { FUD0170 } from '@fudic/diagnostics';
import { i18nImports } from './ast.js';
import { collectMessages, collectScriptMessages, type Message } from './messages.js';

/**
 * The context of a message (§4.9): a component's tag; for anything else — a route, a layout, a
 * page, a snippet file, a `.ts` — the path of the file relative to `src`. `file` is the path
 * relative to the project root, POSIX (`src/routes/about.fud`).
 */
export function contextOf(file: string, document?: StructuredDocument): string {
  if (document?.type === 'component-document' && document.name !== '') return document.name;
  return file.replace(/^src\//u, '');
}

/** Messages of a `.fud`. Never throws: diagnostics come back with the partial result. */
export function extractMessages(source: string, file: string): ParseResult<readonly Message[]> {
  const html = parseDocument(source, { atConstructs });
  const structured = structureDocument(source, html.value);
  const document = structured.value;
  const js = batchOf(source, document);
  const collected = collectMessages({
    source,
    context: contextOf(file, document),
    roots: documentRoots(document),
    astAt: js.astAt,
    scripts: js.scripts,
    imports: i18nImports(js.code),
    mapSpan: js.mapSpan,
  });
  return withDiagnostics(collected.messages, [
    ...html.diagnostics,
    ...structured.diagnostics,
    ...js.diagnostics,
    ...collected.diagnostics,
    ...collected.conflicts,
  ]);
}

/** Messages (`t()` calls) of a `.ts`/`.js` app module. */
export function extractScriptMessages(source: string, file: string): ParseResult<readonly Message[]> {
  const parsed = parseSync(file, source, { sourceType: 'module', lang: /\.[cm]?js$/u.test(file) ? 'js' : 'ts' });
  const program = parsed.program.body as unknown as readonly OxcNode[];
  const collected = collectScriptMessages(contextOf(file), program, i18nImports(program));
  const syntax = parsed.errors.map((e) => {
    const label = e.labels[0];
    return FUD0170({ span: label === undefined ? { start: 0, end: 0 } : { start: label.start, end: label.end }, detail: e.message });
  });
  return withDiagnostics(collected.messages, [...syntax, ...collected.diagnostics, ...collected.conflicts]);
}

/** The one Oxc batch of a document, as the collector reads it. */
export interface DocumentBatch {
  /** The expression registered at a span of the view. */
  astAt(at: Span): OxcNode | undefined;
  /** Every AST of the file, view and `@code`. */
  readonly scripts: readonly (OxcNode | readonly OxcNode[])[];
  /** The ASTs of the view alone: where `|` is a pipe. */
  readonly view: readonly (OxcNode | readonly OxcNode[])[];
  /** The top-level statements of `@code`, its three zones together. */
  readonly code: readonly OxcNode[];
  mapSpan(start: number, end: number): Span;
  readonly diagnostics: readonly Diagnostic[];
}

/** Register every JS fragment of the document — the view's and `@code`'s — and parse once. */
export function batchOf(source: string, document: StructuredDocument): DocumentBatch {
  const batch = new JsBatch(source);
  const expressions = new Map<string, FragmentId>();
  const ids: FragmentId[] = [];
  const add = (at: Span, kind: JsFragmentKind = 'expression'): void => {
    // An empty span is a construct the parser already degraded: the wrapper alone would be a
    // syntax error of this pass's own making.
    if (at.end <= at.start) return;
    const id = batch.add(kind, at);
    ids.push(id);
    if (kind === 'expression') expressions.set(`${at.start},${at.end}`, id);
  };

  walk(documentRoots(document), {
    interpolation: (expr) => add(expr.expr),
    binding: (expr) => add(expr.expr),
    inlineCode: (node) => add(node.group.inner, 'block-statements'),
    render: (node) => {
      for (const arg of node.args) add(arg.value);
    },
    control: (node) => {
      if (node.type === 'if') {
        for (const branch of node.branches) add(branch.header.inner);
        return;
      }
      const key = keyExpression(node);
      if (key !== undefined) add(key);
      if (node.type === 'switch') {
        add(node.header.inner);
        for (const branch of node.cases) if (branch.test !== undefined) add(branch.test);
        return;
      }
      const kind = node.type === 'foreach' ? 'for-of-header' : node.type === 'for' ? 'for-header' : 'expression';
      add(node.header.inner, kind);
    },
  });
  const viewIds = [...ids];
  const codeIds = (document.code?.parts ?? []).map((part) => {
    const id = batch.add('module-statements', part.js);
    ids.push(id);
    return id;
  });

  const parsed = batch.parse();
  const result = parsed.value;
  const code = codeIds.flatMap((id) => result.ast(id) as readonly OxcNode[]);
  return {
    astAt: (at) => {
      const id = expressions.get(`${at.start},${at.end}`);
      return id === undefined ? undefined : (result.ast(id) as OxcNode);
    },
    scripts: ids.map((id) => result.ast(id)),
    view: viewIds.map((id) => result.ast(id)),
    code,
    mapSpan: result.mapSpan,
    diagnostics: parsed.diagnostics,
  };
}
