/**
 * `await` (SDD-70, decisions 168–170): `@await data.users { … }` waits for a field `load`
 * returns as a promise, so the page can be sent before it resolves.
 *
 * - `FUD1320`: what follows `@await` is not `data.<field>`, or that field is not `later`.
 * - `FUD1321`: a `later` field read anywhere but inside the body of an `@await` of it — there
 *   it is the value; everywhere else, still the promise.
 * - `FUD1322`: an `@await` where `data` does not exist or nothing waits — the `<head>`, a
 *   component, a layout, the body of a snippet.
 *
 * Which fields are `later` is the host's to say (`SemanticInput.apis`). When it cannot know,
 * only the shape of what is awaited is checked.
 */

import { FUD1320, FUD1321, FUD1322 } from '@fudic/diagnostics';
import type { AwaitNode } from '../../control/index.js';
import type { StructuredDocument } from '../../document/index.js';
import type { OxcNode } from '../../oxc/index.js';
import { span, type Span } from '../../types/index.js';
import type { Analyzer } from '../model.js';
import { child, field, isNode, nameOf } from '../view-ast.js';
import { portableView } from '../view-portable.js';
import { documentRoots, walk } from '../walk.js';

const NONE: ReadonlySet<string> = new Set();

/** `data.<field>`, as written after `@await`. */
const READ = /^data\.([A-Za-z_$][\w$]*)$/u;

/** Where the body of an `@await` of `field` reads it resolved: past the expression, up to its `@catch`. */
interface Waited {
  readonly field: string;
  readonly start: number;
  readonly end: number;
}

/**
 * The spans of a document where an `@await` may not go, or `null` when it may go nowhere: only
 * the body of a route or a page has a `data` that waits.
 */
function forbidden(document: StructuredDocument): readonly Span[] | null {
  if (document.type === 'route-document') {
    return [...(document.head === undefined ? [] : [document.head.span]), ...document.snippets.map((s) => s.span)];
  }
  if (document.type === 'page-document') return [document.head.span, ...document.snippets.map((s) => s.span)];
  return null;
}

/** Every `data.<name>` of an expression, by its name: a static member read of `data`. */
function dataReads(node: unknown, out: OxcNode[] = []): OxcNode[] {
  if (Array.isArray(node)) {
    for (const item of node) dataReads(item, out);
    return out;
  }
  if (!isNode(node)) return out;
  const object = node.type === 'MemberExpression' && field(node, 'computed') !== true ? child(node, 'object') : undefined;
  if (object?.type === 'Identifier' && nameOf(object) === 'data') out.push(node);
  for (const value of Object.values(node)) dataReads(value, out);
  return out;
}

export const awaitBlocks: Analyzer = {
  name: 'await',
  run(input, report) {
    const later = input.apis === undefined ? undefined : (input.apis.later ?? NONE);
    const awaits: AwaitNode[] = [];
    walk(documentRoots(input.document), { awaitBlock: (node) => awaits.push(node) });

    const outside = forbidden(input.document);
    const waited: Waited[] = [];
    for (const node of awaits) {
      const at = node.span.start;
      if (outside === null || outside.some((s) => at >= s.start && at < s.end)) {
        report(FUD1322({ span: span(at, at + '@await'.length) }));
      }
      const name = READ.exec(input.source.slice(node.expression.start, node.expression.end))?.[1];
      if (name === undefined || (later !== undefined && !later.has(name))) {
        report(FUD1320({ span: node.expression }));
        continue;
      }
      waited.push({ field: name, start: node.expression.end, end: node.catch?.span.start ?? node.span.end });
    }

    if (later === undefined || later.size === 0) return;
    const { scope } = portableView(input);
    for (const fragment of scope.fragments) {
      // A name `data` the template declares itself is not the page's `data`.
      const owner = scope.resolve('data', fragment.scope);
      if (owner === 'template' || owner === 'template-fixed') continue;
      for (const read of dataReads(fragment.root)) {
        const fieldName = nameOf(child(read, 'property')!);
        if (!later.has(fieldName)) continue;
        const where = input.js.mapSpan(read.start, read.end);
        const inside = waited.some((w) => w.field === fieldName && where.start >= w.start && where.end <= w.end);
        if (!inside) report(FUD1321({ span: where, field: fieldName }));
      }
    }
  },
};
