/**
 * Who hands what to whom (SDD-37 §3.2): the pairing of every `delegate:name` marker with the
 * `name` an ancestor's handler reads, and the diagnostics that fall out of it.
 *
 * Since decisions 176–177 the pairing is per EVENT and the row is read by its plain name. A
 * marker may list the events it serves (`delegate:p="click"`), and for each of them it goes to
 * the nearest ancestor with a handler of that event that reads `p`. In the handler, `p` is the
 * row wherever it appears in the arguments — `@borrar(p)`, `@borrar(p.id, p.name)` — as long as
 * a descendant marks `p`; a `$p` is the retired spelling (`FUD1383`), and a `p` that also names
 * something where the handler is written is a clash nobody guesses at (`FUD1382`).
 *
 * It is here, and not inside the analyzer or inside the emit, because BOTH ask it and the two
 * answers have to be the same one: the analyzer turns it into diagnostics for the editor, the
 * emit turns it into a `WeakMap` per name and a wrapper per listener. A pairing computed twice
 * is a pairing that drifts, and the shape it drifts into is a page that compiles clean and
 * reads the wrong row.
 *
 * The scope is INVERTED and that is the whole of why this is one pass and not seven: the child
 * declares and the ancestor consumes, so no rule here can be decided from one node. Five of
 * the codes are about a PAIR, and a pass per code would build the same two lists five times.
 *
 * **No TypeScript.** Every question is answered over the AST — the names come from the loop
 * header's pattern, the reads from the argument list of the handler's call, and the pairing
 * from the element tree. That is the promise of §4.5: the checker TYPES `$day`, it never
 * decides whether `$day` is legal.
 */

import {
  FUD0660,
  FUD0661,
  FUD0662,
  FUD0663,
  FUD0664,
  FUD0665,
  FUD0666,
  FUD1381,
  FUD1382,
  FUD1383,
} from '@fudic/diagnostics';
import { span, type Diagnostic, type Span } from '../types/index.js';
import { classifyAttribute } from '../binding/classify.js';
import { handlerShape, unwrapParens } from '../binding/handler.js';
import { loopHeaderNames, patternNames, type OxcNode } from '../oxc/index.js';
import type { RazorExpression } from '../at/index.js';
import type { Attribute, ElementNode, HtmlContent } from '../html/index.js';
import type { ControlNode, ForeachNode, ForNode, WhileNode } from '../control/index.js';
import { walk } from './walk.js';

/** The event prefix, as the attribute writes it. */
const EVENT_PREFIX = '@';

/** `$event` belongs to SDD-15 (decisions 96–98): not a delegated read, and not ours to judge. */
const EVENT_ARGUMENT = '$event';

/**
 * The runtime pieces of `@fudic/i18n` a locale's rewrite writes into the view (SDD-58 §4.4,
 * §4.8): a plural as `$message(…)`, a dynamic link as `$href(…)`. The compiler's own names, like
 * `$event`, and never a delegated read. A pipe writes none: it is `euros.format(precio, "en")`.
 */
const I18N_PIECES: ReadonlySet<string> = new Set(['$message', '$href']);

/** The prefix of the tables (§4.1). One per name a handler reads, in the ancestor's closure. */
const TABLE_PREFIX = '$t';

/**
 * The events delegation cannot carry, with the substitute where the platform has one (§4.4).
 *
 * Delegation is a listener on an ancestor, so an event that does not bubble never reaches it.
 * The list is CLOSED: a custom event bubbles unless its author says otherwise, and guessing
 * from the name would reject `my-focus` for the letters it happens to end in.
 */
export const NON_BUBBLING: ReadonlyMap<string, string | null> = new Map([
  ['focus', 'focusin'],
  ['blur', 'focusout'],
  ['mouseenter', 'mouseover'],
  ['mouseleave', 'mouseout'],
  ['pointerenter', 'pointerover'],
  ['pointerleave', 'pointerout'],
  ['load', null],
  ['error', null],
  ['abort', null],
  ['scroll', null],
  ['resize', null],
  ['unload', null],
]);

/** Fields that NAME something instead of referring to it: `obj.$x` and `{ $x: 1 }`. */
const NAMING_FIELDS = new Set(['property', 'key']);

/** The three constructs that iterate — the only ones a marker may sit in (decision 117). */
type LoopNode = ForeachNode | ForNode | WhileNode;

/**
 * The JavaScript of the template, as the caller can reach it.
 *
 * Two callers with two different doors to the same batch: the semantic pass looks a fragment
 * up by NODE (`fragmentId`) and the emit by SPAN (`TemplateJs`). Injecting the door is what
 * lets one pairing serve both — and it is the only thing the two disagree about.
 */
export interface DelegationJs {
  /** The `for`/`for-of` statement of a loop header, or `undefined` when it has no AST. */
  headerAst(loop: LoopNode): OxcNode | undefined;
  /** The expression of an attribute value or an interpolation, or `undefined`. */
  valueAst(expr: RazorExpression): OxcNode | undefined;
  /** An AST node's span back in the `.fud`. */
  spanOf(node: OxcNode): Span;
  /**
   * The names the `@code` imports or declares: what a handler's `day` may already mean, which
   * is a clash with a row of the same name (`FUD1382`).
   */
  readonly scope: ReadonlySet<string>;
}

/** What one marker element registers: a table, and the name whose value it hands over. */
export interface DelegationMark {
  readonly name: string;
  readonly table: string;
}

/** What one handler reads: the table for a row's name, and one place the name is written. */
export interface DelegationRead {
  readonly name: string;
  readonly table: string;
  /** The identifier in the `.fud`, so the emit can splice `$zN()` over it. */
  readonly at: Span;
  /** Written as a shorthand property, `{ p }`: the splice has to keep the key, `{ p: $z0() }`. */
  readonly shorthand: boolean;
  /**
   * The headers to re-open to reach the name, outermost first — every enclosing loop down to
   * the one that declares it.
   *
   * The projection of SDD-23 needs it and nothing else does: `$day` is written in the
   * ancestor's handler, OUTSIDE the loop, so the only way to give it the row's type is to
   * re-open the loop's scope around the handler. The whole CHAIN and not one header, because
   * an inner header reads what an outer one declared — `const item of group.rows` is not a
   * scope anybody can open without opening `const group of groups` first (§4.5).
   */
  readonly loopHeaders: readonly Span[];
}

/** Everything the two callers need, computed once. */
export interface DelegationPlan {
  readonly diagnostics: readonly Diagnostic[];
  /** The `WeakMap.set` calls one element owes, by the element that carries the markers. */
  readonly marks: ReadonlyMap<ElementNode, readonly DelegationMark[]>;
  /** The reads of one event binding, by the attribute that spells it. */
  readonly reads: ReadonlyMap<Attribute, readonly DelegationRead[]>;
  /** Every table to declare, in the order it was named. */
  readonly tables: readonly string[];
}

/** An empty plan: what a document with no marker and no `$name` produces. */
const EMPTY: DelegationPlan = {
  diagnostics: [],
  marks: new Map(),
  reads: new Map(),
  tables: [],
};

/** One enclosing loop and the names its header declares. */
interface Enclosing {
  readonly loop: LoopNode;
  readonly names: readonly string[];
}

/** A `delegate:name` marker, with every loop it sits in, outermost first. */
interface Marker {
  readonly name: string;
  readonly attr: Attribute;
  readonly nameSpan: Span;
  readonly element: ElementNode;
  /** The events it serves; absent, every event whose handler reads its name. */
  readonly events?: readonly string[];
  readonly eventsSpan?: Span;
  /**
   * The enclosing loops, outermost first. Empty when the marker is in none of them.
   *
   * The whole stack and not the innermost, because nested loops are the case decision 119
   * spells out: `<b delegate:row delegate:tag>` inside two `@foreach` is one element handing
   * over two identities, and `row` is declared by the outer header. Reading only the innermost
   * would make the outer name unwritable at the very depth it is worth writing.
   */
  readonly enclosing: readonly Enclosing[];
}

/** A free identifier of a handler's arguments: a row read, if a descendant marks its name. */
interface Mention {
  readonly name: string;
  readonly at: Span;
  readonly shorthand: boolean;
}

/** One event binding whose root is a call: a reader, if any of its mentions is a row. */
interface Candidate {
  readonly attr: Attribute;
  readonly element: ElementNode;
  readonly eventName: string;
  readonly at: Span;
  readonly mentions: readonly Mention[];
  /** What the loops around the HANDLER declare: a row of the same name would clash. */
  readonly enclosingNames: ReadonlySet<string>;
}

/** One event binding that reads at least one row. */
interface Reader {
  readonly attr: Attribute;
  readonly element: ElementNode;
  readonly eventName: string;
  readonly at: Span;
  readonly reads: readonly Mention[];
}

/** Everything one walk of the tree gathers. */
interface Collected {
  readonly markers: readonly Marker[];
  readonly candidates: readonly Candidate[];
  /** Nearest ancestor element, control bodies seen through. The chain the pairing walks up. */
  readonly parentOf: ReadonlyMap<ElementNode, ElementNode>;
  readonly diagnostics: readonly Diagnostic[];
}

/** Pair every marker with its reader, over one walk of `roots`. */
export function planDelegation(
  source: string,
  roots: readonly HtmlContent[],
  js: DelegationJs,
): DelegationPlan {
  const collected = collect(source, roots, js);
  // With no marker no name is a row, so nothing can be read and nothing paired.
  if (collected.markers.length === 0) {
    return collected.diagnostics.length === 0 ? EMPTY : { ...EMPTY, diagnostics: collected.diagnostics };
  }
  return pair(collected, js.scope);
}

// ---------------------------------------------------------------------------
// Collection — one walk over the tree
// ---------------------------------------------------------------------------

function collect(source: string, roots: readonly HtmlContent[], js: DelegationJs): Collected {
  const markers: Marker[] = [];
  const candidates: Candidate[] = [];
  const parentOf = new Map<ElementNode, ElementNode>();
  const diagnostics: Diagnostic[] = [];
  /**
   * The values of the event bindings seen so far. The walk fires `element` before the bindings
   * of that same element, so by the time an expression comes round this says whether it is a
   * handler: a `$day` there is the retired spelling of a row (`FUD1383`), and anywhere else —
   * a `class:` value, an interpolation — a name the compiler reserves (`FUD0666`).
   */
  const handlers = new Set<RazorExpression>();

  const loops: Enclosing[] = [];

  walk(roots, {
    // `control` fires for every construct before its bodies are descended, and `exitLoop` for
    // the three that iterate. Reading the discriminant here is what keeps the two in step: an
    // `@if` is pushed by neither and popped by neither.
    control(node) {
      if (isLoop(node)) loops.push({ loop: node, names: headerNamesOf(js, node) });
    },
    exitLoop() {
      loops.pop();
    },
    element(el, host) {
      if (host !== undefined) parentOf.set(el, host);
      for (const attr of el.attributes) {
        const classified = classifyAttribute(attr, source);
        const binding = classified.value;
        if (binding.type === 'delegate') {
          // `FUD0667` is decided by the classification (SDD-07's layer) and would otherwise be
          // seen by `pnpm build` alone — the very split BUG-23 spent a month closing for
          // `FUD0291`. Forwarding it here is what puts all eight in one place, and the rule
          // still has exactly one definition.
          diagnostics.push(...classified.diagnostics);
          markers.push({
            name: binding.name,
            attr,
            nameSpan: binding.nameSpan,
            element: el,
            ...(binding.events === undefined ? {} : { events: binding.events, eventsSpan: binding.eventsSpan! }),
            enclosing: [...loops],
          });
          continue;
        }
        if (binding.type !== 'event') continue;
        handlers.add(binding.value);

        const root = js.valueAst(binding.value);
        if (handlerShape(root) !== 'call') continue;
        const start = attr.span.start + EVENT_PREFIX.length;
        candidates.push({
          attr,
          element: el,
          eventName: binding.name,
          at: span(start, start + binding.name.length),
          mentions: mentionsOf(js, unwrapParens(root)!),
          enclosingNames: new Set(loops.flatMap((at) => at.names)),
        });
      }
    },
    // Every expression of an attribute: a `$name` is never a row any more, and what it is
    // instead depends on whether the expression is a handler.
    binding(expr) {
      strayDollars(js, expr, handlers.has(expr), diagnostics);
    },
    interpolation(expr) {
      strayDollars(js, expr, false, diagnostics);
    },
  });

  return { markers, candidates, parentOf, diagnostics };
}

function isLoop(node: ControlNode): node is LoopNode {
  return node.type === 'foreach' || node.type === 'for' || node.type === 'while';
}

/** What the header of a loop declares — the list `FUD0662` checks a marker against. */
function headerNamesOf(js: DelegationJs, loop: LoopNode): readonly string[] {
  const root = js.headerAst(loop);
  return root === undefined ? [] : loopHeaderNames(root, loop.type);
}

/**
 * Every free identifier in the ARGUMENTS of a handler's call — the places a row may be read
 * (decision 177): `@borrar(p)`, `@borrar(p.id, p.name)`, `@f({ p })`.
 *
 * The arguments and not the callee: the emit evaluates the row before calling, so `p` can be
 * anywhere the call's values are computed. A name that NAMES something — `x.p`, `{ p: 1 }` — is
 * not a mention, and a function inside the arguments that declares `p` itself hides it.
 */
function mentionsOf(js: DelegationJs, call: OxcNode): readonly Mention[] {
  const out: Mention[] = [];
  // A `CallExpression` has an `arguments` array: that is the node's shape, not a hope about
  // it, and guarding it would be a branch no AST can take.
  for (const arg of call['arguments'] as readonly OxcNode[]) visitMentions(js, arg, new Set(), out);
  return out;
}

function visitMentions(js: DelegationJs, node: OxcNode, hidden: ReadonlySet<string>, out: Mention[]): void {
  if (node.type === 'Identifier') {
    const name = String(node['name']);
    if (!name.startsWith('$') && !hidden.has(name)) out.push({ name, at: js.spanOf(node), shorthand: false });
    return;
  }
  // `{ p }` is a key and a value in one identifier: the value is the read, and the splice has to
  // write the key back.
  if (node.type === 'Property' && node['shorthand'] === true) {
    const value = node['value'] as OxcNode;
    const name = String(value['name']);
    if (!hidden.has(name)) out.push({ name, at: js.spanOf(value), shorthand: true });
    return;
  }
  let inner = hidden;
  if (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') {
    inner = new Set([...hidden, ...(node['params'] as readonly unknown[]).flatMap((p) => patternNames(p))]);
  }
  const computed = node['computed'] === true;
  for (const [key, value] of Object.entries(node)) {
    if (NAMING_FIELDS.has(key) && !computed) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (isNode(item)) visitMentions(js, item, inner, out);
      }
      continue;
    }
    if (isNode(value)) visitMentions(js, value, inner, out);
  }
}

/**
 * Every `$name` of an expression: in a handler, the retired spelling of a row (`FUD1383`, with
 * the plain name as the fix); anywhere else, a name the compiler reserves (`FUD0666`).
 */
function strayDollars(js: DelegationJs, expr: RazorExpression, handler: boolean, out: Diagnostic[]): void {
  const root = js.valueAst(expr);
  if (root === undefined) return;
  visitDollars(root, (found) => {
    const name = String(found['name']);
    out.push(
      handler
        ? FUD1383({ span: js.spanOf(found), name: name.slice(1) })
        : FUD0666({ span: js.spanOf(found), name }),
    );
  });
}

/** A `$`-prefixed identifier that is not `$event`, which belongs to SDD-15. */
function isDollarName(name: string): boolean {
  return name.length > 1 && name.startsWith('$') && name !== EVENT_ARGUMENT && !I18N_PIECES.has(name);
}

/** Every `$name` identifier in a subtree, member names and property keys excepted. */
function visitDollars(node: OxcNode, found: (node: OxcNode) => void): void {
  if (node.type === 'Identifier' && isDollarName(String(node['name']))) found(node);

  const computed = node['computed'] === true;
  for (const [key, value] of Object.entries(node)) {
    if (NAMING_FIELDS.has(key) && !computed) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (isNode(item)) visitDollars(item, found);
      }
      continue;
    }
    if (isNode(value)) visitDollars(value, found);
  }
}

function isNode(value: unknown): value is OxcNode {
  return typeof value === 'object' && value !== null && typeof (value as OxcNode).type === 'string';
}

// ---------------------------------------------------------------------------
// Pairing (§3.2) — the five rules about a marker and its reader
// ---------------------------------------------------------------------------

function pair(collected: Collected, scope: ReadonlySet<string>): DelegationPlan {
  const { markers, candidates, parentOf } = collected;
  const diagnostics = [...collected.diagnostics];
  const marks = new Map<ElementNode, DelegationMark[]>();
  const reads = new Map<Attribute, DelegationRead[]>();
  const tables: string[] = [];

  // The names marked below each element: what turns a mention in its handlers into a row.
  const markedBelow = new Map<ElementNode, Set<string>>();
  for (const marker of markers) {
    for (let at = parentOf.get(marker.element); at !== undefined; at = parentOf.get(at)) {
      const names = markedBelow.get(at) ?? new Set<string>();
      names.add(marker.name);
      markedBelow.set(at, names);
    }
  }

  // The readers: the candidates with at least one row among their mentions. A row whose name
  // also means something where the handler is written is `FUD1382`, and that handler reads no
  // row at all — but it stays a reader, so its markers are not told nobody reads them.
  const readersOf = new Map<ElementNode, Reader[]>();
  const clashing = new Set<Reader>();
  for (const candidate of candidates) {
    const below = markedBelow.get(candidate.element);
    const rows = candidate.mentions.filter((m) => below?.has(m.name) === true);
    if (rows.length === 0) continue;
    const { attr, element, eventName, at } = candidate;
    const reader: Reader = { attr, element, eventName, at, reads: rows };
    for (const row of rows) {
      if (!scope.has(row.name) && !candidate.enclosingNames.has(row.name)) continue;
      diagnostics.push(FUD1382({ span: row.at, name: row.name }));
      clashing.add(reader);
    }
    readersOf.set(candidate.element, [...(readersOf.get(candidate.element) ?? []), reader]);
  }

  /** The nearest STRICT ancestor with a handler of `event` that reads `name` (decision 176). */
  const readerOf = (from: ElementNode, name: string, event: string): ElementNode | undefined => {
    for (let at = parentOf.get(from); at !== undefined; at = parentOf.get(at)) {
      const found = (readersOf.get(at) ?? []).some(
        (r) => r.eventName === event && r.reads.some((x) => x.name === name),
      );
      if (found) return at;
    }
    return undefined;
  };

  /** The events whose handlers, above `from`, read `name`: what a marker with no list serves. */
  const eventsReading = (from: ElementNode, name: string): readonly string[] => {
    const events = new Set<string>();
    for (let at = parentOf.get(from); at !== undefined; at = parentOf.get(at)) {
      for (const r of readersOf.get(at) ?? []) {
        if (r.reads.some((x) => x.name === name)) events.add(r.eventName);
      }
    }
    return [...events];
  };

  /**
   * One table per reader, name and EVENT — and the same table for both ends of it. Per event,
   * so a `click` looks only among the markers that serve `click`: the checkbox of a row marked
   * for `change` is not found by the `@click` that deletes it.
   */
  const bound = new Map<
    string,
    { readonly table: string; readonly headers: readonly Span[]; readonly loops: ControlNode[] }
  >();
  const keyOf = (el: ElementNode, name: string, event: string): string => `${el.span.start} ${name} ${event}`;

  for (const marker of markers) {
    if (marker.enclosing.length === 0) {
      diagnostics.push(FUD0663({ span: marker.attr.span }));
      continue;
    }
    // Innermost first: with two loops declaring `row`, the row a marker hands over is the one
    // whose scope it is written in, which is the same one the emit closes over.
    const depth = marker.enclosing.findLastIndex((at) => at.names.includes(marker.name));
    const declaring = marker.enclosing[depth];
    if (declaring === undefined) {
      diagnostics.push(notAHeaderBinding(marker));
      continue;
    }
    const served = marker.events ?? eventsReading(marker.element, marker.name);
    if (served.length === 0) {
      diagnostics.push(FUD0661({ span: marker.attr.span, name: marker.name }));
      continue;
    }
    for (const event of served) {
      const reader = readerOf(marker.element, marker.name, event);
      if (reader === undefined) {
        // Only a listed event can have no reader: an unlisted one was found BY its reader.
        diagnostics.push(FUD1381({ span: marker.eventsSpan!, event, name: marker.name }));
        continue;
      }
      const key = keyOf(reader, marker.name, event);
      let entry = bound.get(key);
      if (entry === undefined) {
        entry = {
          table: `${TABLE_PREFIX}${tables.length}`,
          // Down to the declaring loop, and every enclosing one on the way: the projection has
          // to open them in this order or the inner header names something nobody declared.
          headers: marker.enclosing.slice(0, depth + 1).map((at) => at.loop.header.inner),
          loops: [],
        };
        tables.push(entry.table);
        bound.set(key, entry);
      }
      // Two markers of the SAME loop are the ordinary case — a row has a cell and a button, and
      // both hand over the same `day`. Two LOOPS are the ambiguity: the dispatch finds a row and
      // cannot say which loop it came from, and that is true even when both iterate the same
      // type — which is what keeps this check on the AST and out of the checker (§5).
      if (entry.loops.length > 0 && !entry.loops.includes(declaring.loop)) {
        diagnostics.push(FUD0664({ span: marker.attr.span, name: marker.name }));
        continue;
      }
      entry.loops.push(declaring.loop);
      marks.set(marker.element, [
        ...(marks.get(marker.element) ?? []),
        { name: marker.name, table: entry.table },
      ]);
    }
  }

  for (const reader of [...readersOf.values()].flat()) {
    const resolved: DelegationRead[] = [];
    for (const read of reader.reads) {
      const entry = bound.get(keyOf(reader.element, read.name, reader.eventName));
      if (entry === undefined) {
        diagnostics.push(FUD0660({ span: read.at, name: read.name, event: reader.eventName }));
        continue;
      }
      resolved.push({
        name: read.name,
        table: entry.table,
        at: read.at,
        shorthand: read.shorthand,
        loopHeaders: entry.headers,
      });
    }
    // A handler whose reads did not all resolve delegates nothing: it is dropped by the emit
    // rather than written with a name that is not there (§5, invariant 5). Nor does one whose
    // row clashes with a name in scope: which of the two the author meant is not ours to say.
    if (resolved.length === reader.reads.length && !clashing.has(reader)) reads.set(reader.attr, resolved);

    // Only a handler that delegates needs its event to bubble: the same `@mouseenter` with no
    // `$name` is an ordinary listener on that very element, and stays legal.
    const substitute = NON_BUBBLING.get(reader.eventName);
    if (substitute === undefined) continue;
    diagnostics.push(
      FUD0665({
        span: reader.at,
        event: reader.eventName,
        ...(substitute === null ? {} : { substitute }),
      }),
    );
  }

  return { diagnostics, marks, reads, tables };
}

function notAHeaderBinding(marker: Marker): Diagnostic {
  // Every enclosing loop's names and not only the innermost's: with nested loops, all of them
  // are in scope here, so all of them are what the author may have meant.
  const available = [...new Set(marker.enclosing.flatMap((at) => at.names))];
  return FUD0662({ span: marker.nameSpan, name: marker.name, available });
}
