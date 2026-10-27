/**
 * The two places the TS emit of the view gives up JavaScript's meaning for the portable one
 * (SDD-61 §4.4, points 1 and 2), applied to the SOURCE before anything compiles it.
 *
 * 1. **Presence.** `x === null`, `x === undefined` and their `!==` ask whether `x` is there,
 *    and in the six languages «not there» is one thing. So the view and the server cut write
 *    them as `x == null` / `x != null`.
 * 2. **Defaults.** A default of a pattern of the view applies when the field is absent, `null`
 *    included, as `?? default` does. A JS default only fires on `undefined`, so the property
 *    binds a hidden name and the author's binding is declared right after, from that name:
 *
 *        @foreach (const { slug, featured = false } of xs) { …
 *        @foreach (const { slug, featured: $dflt0 } of xs) {@{ const featured = $dflt0 ?? (false); }…
 *
 *        @{ const { a = 1 } = x; }   →   @{ const { a: $dflt0 } = x, a = $dflt0 ?? (1); }
 *
 * **Why the source and not the emit.** Every emitter splices the author's expressions by span,
 * the server's and the client's alike, so a rewrite of the text reaches all of them, in the
 * same way, and none learns it happened. It is the choice the locale rewrite made (SDD-58
 * §4.6), and the table that maps the result back to the file is the same `OffsetMap`. The
 * editor and the semantic pass never see this text: they read the file the author wrote.
 *
 * **What is the view here.** Every fragment of the markup but the value of a handler (`@x=`,
 * `bus:`) and of a callback — a value that is an arrow as a whole —, which are free TS
 * (§3.11). And of the `@code`, the server cut: what the view reads, transitively, through the
 * declarations that are not functions (§3.9).
 *
 * A second Oxc parse of the file, so it is only paid when the text can hold one of the two:
 * a file with no `=== null`-like comparison and no default in a destructuring is not parsed.
 */

import { atConstructs } from '../constructs.js';
import { keyExpression } from '../control/index.js';
import { structureDocument, type StructuredDocument } from '../document/index.js';
import { ExpandedText, type OffsetMap } from '../expand/offsets.js';
import type { RazorExpression } from '../at/index.js';
import { parseDocument, type Attribute } from '../html/index.js';
import { JsBatch, type FragmentId, type JsFragmentKind, type OxcNode } from '../oxc/index.js';
import { child, children, field, isNode, nameOf } from '../semantic/view-ast.js';
import { documentRoots, walk } from '../semantic/walk.js';
import { span, type Span } from '../types/index.js';

/** A source the emit compiles instead of the file, and the way back to the file. */
export interface LoweredSource {
  readonly source: string;
  readonly map: OffsetMap;
}

/** Text that may hold a presence comparison. A false positive only costs the parse. */
const PRESENCE_HINT = /[!=]==[\s(]*(?:null|undefined)\b|\b(?:null|undefined)[\s)]*[!=]==/;
/** Text that may hold a default inside an object pattern: `{ a = 1 }`, `{ b: c = 2 }`. */
const DEFAULT_HINT = /\{[^{}]*[\w$\]}]\s*=(?![=>])/;

/** The hidden name a defaulted property binds before its `??`. Reserved like every `$` name. */
const HIDDEN = '$dflt';

interface Edit {
  readonly at: Span;
  readonly text: string;
}

/** The source the emit compiles for `source`, or `undefined` when there is nothing to lower. */
export function lowerPortable(file: string, source: string): LoweredSource | undefined {
  if (!PRESENCE_HINT.test(source) && !DEFAULT_HINT.test(source)) return undefined;
  const document = structureDocument(source, parseDocument(source, { atConstructs }).value).value;
  const edits = new Lowering(source, document).edits();
  if (edits.length === 0) return undefined;
  return rewrite(file, source, edits);
}

/** Apply edits that do not overlap, each anchored at what it replaces. */
function rewrite(file: string, source: string, edits: readonly Edit[]): LoweredSource {
  const out = new ExpandedText();
  let at = 0;
  for (const edit of [...edits].sort((a, b) => a.at.start - b.at.start)) {
    out.copy(file, source, span(at, edit.at.start));
    out.synthetic(edit.text, { file, at: edit.at });
    at = edit.at.end;
  }
  out.copy(file, source, span(at, source.length));
  return { source: out.text, map: out.build() };
}

/** What one fragment of the markup is, for the two rewrites. */
type Role = 'view' | 'loop' | 'inline';

/** The edits of one file. Lives as long as that question. */
class Lowering {
  readonly #source: string;
  readonly #document: StructuredDocument;
  readonly #out: Edit[] = [];
  #hidden = 0;
  #mapSpan: (start: number, end: number) => Span = span;

  constructor(source: string, document: StructuredDocument) {
    this.#source = source;
    this.#document = document;
  }

  edits(): readonly Edit[] {
    const batch = new JsBatch(this.#source);
    const fragments: { readonly id: FragmentId; readonly role: Role; readonly body?: number }[] = [];
    const add = (at: Span, kind: JsFragmentKind, role: Role, body?: number): void => {
      if (at.end <= at.start) return;
      fragments.push({ id: batch.add(kind, at), role, ...(body === undefined ? {} : { body }) });
    };
    walk(documentRoots(this.#document), {
      interpolation: (expr) => add(expr.expr, 'expression', 'view'),
      // A handler is free TS (§3.11): its value is not the view's, and it is not registered.
      binding: (expr, attr) => {
        if (!isDeferred(expr, attr)) add(expr.expr, 'expression', 'view');
      },
      inlineCode: (node) => add(node.group.inner, 'block-statements', 'inline'),
      render: (node) => {
        for (const arg of node.args) add(arg.value, 'expression', 'view');
      },
      control: (node) => {
        if (node.type === 'if') {
          for (const branch of node.branches) add(branch.header.inner, 'expression', 'view');
          return;
        }
        const key = keyExpression(node);
        if (key !== undefined) add(key, 'expression', 'view');
        if (node.type === 'switch') {
          add(node.header.inner, 'expression', 'view');
          for (const branch of node.cases) if (branch.test !== undefined) add(branch.test, 'expression', 'view');
          return;
        }
        if (node.type === 'foreach') add(node.header.inner, 'for-of-header', 'loop', this.#bodyOpen(key ?? node.header.span));
        else add(node.header.inner, node.type === 'for' ? 'for-header' : 'expression', 'view');
      },
    });
    const code = (this.#document.code?.parts ?? []).map((part) => batch.add('module-statements', part.js));

    const parsed = batch.parse().value;
    this.#mapSpan = parsed.mapSpan;
    const reads = new Set<string>();
    for (const { id, role, body } of fragments) {
      const root = parsed.ast(id);
      if (Array.isArray(root)) {
        for (const statement of root as readonly OxcNode[]) this.#inline(statement);
      } else if (role === 'loop') {
        this.#loop(root as OxcNode, body!);
      } else if (!isCallback(root as OxcNode)) {
        this.#presence(root as OxcNode);
      }
      collectNames(root, reads);
    }
    for (const init of cut(code.flatMap((id) => parsed.ast(id) as readonly OxcNode[]), reads)) this.#presence(init);
    return this.#out;
  }

  /** Where the body of a loop opens: right after its `{`, which follows the header or the key. */
  #bodyOpen(after: Span): number {
    return this.#source.indexOf('{', after.end) + 1;
  }

  #range(node: OxcNode): Span {
    return this.#mapSpan(node.start, node.end);
  }

  #text(node: OxcNode): string {
    const at = this.#range(node);
    return this.#source.slice(at.start, at.end);
  }

  /** Every presence comparison under `node`, rewritten in place. */
  #presence(node: unknown): void {
    if (Array.isArray(node)) {
      for (const item of node) this.#presence(item);
      return;
    }
    if (!isNode(node)) return;
    if (node.type === 'BinaryExpression') {
      const operator = String(field(node, 'operator'));
      const left = child(node, 'left')!;
      const right = child(node, 'right')!;
      if ((operator === '===' || operator === '!==') && (isAbsent(left) || isAbsent(right))) {
        const gap = this.#mapSpan(left.end, right.start);
        const at = gap.start + this.#source.slice(gap.start, gap.end).indexOf(operator);
        this.#out.push({ at: span(at, at + 3), text: operator.slice(0, 2) });
        // `== undefined` would mean the same; `== null` is what the six languages are told.
        for (const side of [left, right]) {
          const value = unwrapParens(side);
          if (isAbsent(value) && value.type === 'Identifier') this.#out.push({ at: this.#range(value), text: 'null' });
        }
      }
    }
    for (const value of Object.values(node)) this.#presence(value);
  }

  /** A statement of an `@{ }`: its presence, and the defaults of a destructuring declaration. */
  #inline(statement: OxcNode): void {
    if (statement.type !== 'VariableDeclaration') {
      this.#presence(statement);
      return;
    }
    const declarations = children(statement, 'declarations');
    // The initializers only: a default is copied whole into the declarator it moves to.
    for (const declaration of declarations) this.#presence(child(declaration, 'init'));
    const extra = declarations.flatMap((d) => this.#pattern(child(d, 'id')!));
    if (extra.length === 0) return;
    const end = this.#range(declarations[declarations.length - 1]!).end;
    this.#out.push({ at: span(end, end), text: extra.map((e) => `, ${e}`).join('') });
  }

  /** A `@foreach` header: what its pattern defaults is declared first thing in its body. */
  #loop(header: OxcNode, body: number): void {
    this.#presence(child(header, 'right'));
    const left = child(header, 'left')!;
    if (left.type !== 'VariableDeclaration') return;
    const extra = this.#pattern(child(children(left, 'declarations')[0]!, 'id')!);
    if (extra.length === 0) return;
    this.#out.push({ at: span(body, body), text: `@{ ${String(field(left, 'kind'))} ${extra.join(', ')}; }` });
  }

  /**
   * The defaults of an object pattern, each replaced by a hidden name, and the declarators that
   * bind the author's names from them: `a = $dflt0 ?? (1)`. A defaulted nested pattern is
   * lowered the same way, inside the declarator it moved to.
   */
  #pattern(pattern: OxcNode): readonly string[] {
    if (pattern.type !== 'ObjectPattern') return [];
    const extra: string[] = [];
    for (const property of children(pattern, 'properties')) {
      if (property.type !== 'Property') continue; // a `...rest` has no default
      const value = child(property, 'value')!;
      if (value.type === 'ObjectPattern') {
        extra.push(...this.#pattern(value));
        continue;
      }
      if (value.type !== 'AssignmentPattern') continue;
      const target = child(value, 'left')!;
      const hidden = `${HIDDEN}${this.#hidden++}`;
      const fallback = `${hidden} ?? (${this.#text(child(value, 'right')!)})`;
      this.#out.push(
        field(property, 'shorthand') === true
          ? { at: this.#range(property), text: `${nameOf(target)}: ${hidden}` }
          : { at: this.#range(value), text: hidden },
      );
      if (target.type !== 'ObjectPattern') {
        extra.push(`${nameOf(target)} = ${fallback}`);
        continue;
      }
      const nested = this.#lowered(target);
      extra.push(`${nested.text} = ${fallback}`, ...nested.extra);
    }
    return extra;
  }

  /** A nested pattern as text, with its own defaults lowered, and the declarators they need. */
  #lowered(pattern: OxcNode): { readonly text: string; readonly extra: readonly string[] } {
    const before = this.#out.length;
    const extra = this.#pattern(pattern);
    const at = this.#range(pattern);
    // Its edits leave the file's table: they are applied here, to this copy of the text.
    const inner = this.#out.splice(before).sort((a, b) => b.at.start - a.at.start);
    let text = this.#source.slice(at.start, at.end);
    for (const edit of inner) {
      text = text.slice(0, edit.at.start - at.start) + edit.text + text.slice(edit.at.end - at.start);
    }
    return { text, extra };
  }
}

/** The value of an `@event` or `bus:` binding; `bus:( … )` names its event with a value of the view. */
function isDeferred(expr: RazorExpression, attr: Attribute): boolean {
  if (typeof attr.name !== 'string') return attr.name !== expr;
  return attr.name.startsWith('@') || attr.name.startsWith('bus:');
}

/** `null`, or the global `undefined`: what a presence comparison compares with. */
function isAbsent(node: OxcNode): boolean {
  const value = unwrapParens(node);
  return (value.type === 'Literal' && field(value, 'value') === null && field(value, 'raw') === 'null') ||
    (value.type === 'Identifier' && nameOf(value) === 'undefined');
}

/** A callback: the value of a `.prop` that is an arrow or a function as a whole (§3.1). */
function isCallback(node: OxcNode): boolean {
  const value = unwrapParens(node);
  return value.type === 'ArrowFunctionExpression' || value.type === 'FunctionExpression';
}

function unwrapParens(node: OxcNode): OxcNode {
  let current = node;
  while (current.type === 'ParenthesizedExpression') current = child(current, 'expression')!;
  return current;
}

/** Every identifier name under `node`: what a fragment may read. More than it reads is fine. */
function collectNames(node: unknown, out: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) collectNames(item, out);
    return;
  }
  if (!isNode(node)) return;
  if (node.type === 'Identifier') out.add(nameOf(node));
  for (const value of Object.values(node)) collectNames(value, out);
}

/**
 * The initializers of the server cut: the top-level declarators of the `@code` the view reads,
 * and the ones those read, that are not functions (§3.9). A function the view calls runs in
 * the browser too, and it is free TS.
 */
function cut(statements: readonly OxcNode[], reads: Set<string>): readonly OxcNode[] {
  const declared = new Map<string, OxcNode>();
  for (const statement of statements) {
    const declaration = statement.type === 'ExportNamedDeclaration' ? child(statement, 'declaration') : statement;
    if (declaration?.type !== 'VariableDeclaration') continue;
    for (const declarator of children(declaration, 'declarations')) {
      const init = child(declarator, 'init');
      const id = child(declarator, 'id')!;
      if (init === undefined || isCallback(init) || id.type !== 'Identifier') continue;
      declared.set(nameOf(id), init);
    }
  }
  const out: OxcNode[] = [];
  const pending = [...reads];
  const seen = new Set<string>();
  for (let name = pending.pop(); name !== undefined; name = pending.pop()) {
    const init = declared.get(name);
    if (init === undefined || seen.has(name)) continue;
    seen.add(name);
    out.push(init);
    const more = new Set<string>();
    collectNames(init, more);
    pending.push(...more);
  }
  return out;
}
