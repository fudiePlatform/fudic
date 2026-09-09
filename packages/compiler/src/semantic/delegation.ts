/**
 * Who hands what to whom (SDD-37 §3.2): the pairing of every `delegate:name` marker with the
 * `$name` an ancestor's handler reads, and the seven diagnostics that fall out of it.
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

import { errorDiag, span, type Diagnostic, type Span } from '../types/index.js';
import { classifyAttribute } from '../binding/classify.js';
import { loopHeaderNames, type OxcNode } from '../oxc/index.js';
import type { RazorExpression } from '../at/index.js';
import type { Attribute, ElementNode, HtmlContent } from '../html/index.js';
import type { ControlNode, ForeachNode, ForNode, WhileNode } from '../control/index.js';
import { walk } from './walk.js';

const FUD_NO_MARKER = 'FUD0660';
const FUD_NO_READER = 'FUD0661';
const FUD_NOT_A_HEADER_BINDING = 'FUD0662';
const FUD_MARKER_OUTSIDE_LOOP = 'FUD0663';
const FUD_NAME_TWICE = 'FUD0664';
const FUD_EVENT_DOES_NOT_BUBBLE = 'FUD0665';
const FUD_READ_OUTSIDE_ARGUMENTS = 'FUD0666';

/** The event prefix, as the attribute writes it. */
const EVENT_PREFIX = '@';

/** `$event` belongs to SDD-15 (decisions 96–98): not a delegated read, and not ours to judge. */
const EVENT_ARGUMENT = '$event';

/** The prefix of the tables (§4.1). One per name a handler reads, in the ancestor's closure. */
const TABLE_PREFIX = '$t';

/**
 * The events delegation cannot carry, with the substitute where the platform has one (§4.4).
 *
 * Delegation is a listener on an ancestor, so an event that does not bubble never reaches it.
 * The list is CLOSED: a custom event bubbles unless its author says otherwise, and guessing
 * from the name would reject `my-focus` for the letters it happens to end in.
 */
const NON_BUBBLING: ReadonlyMap<string, string | null> = new Map([
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

/** The three constructs that iterate — the only ones a marker may sit in (decision 116). */
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
}

/** What one marker element registers: a table, and the name whose value it hands over. */
export interface DelegationMark {
  readonly name: string;
  readonly table: string;
}

/** What one handler reads: the table for a `$name`, and where the `$name` is written. */
export interface DelegationRead {
  readonly name: string;
  readonly table: string;
  /** The `$name` identifier in the `.fud`, so the emit can splice `$zN()` over it. */
  readonly at: Span;
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
  /**
   * The enclosing loops, outermost first. Empty when the marker is in none of them.
   *
   * The whole stack and not the innermost, because nested loops are the case decision 118
   * spells out: `<b delegate:row delegate:tag>` inside two `@foreach` is one element handing
   * over two identities, and `row` is declared by the outer header. Reading only the innermost
   * would make the outer name unwritable at the very depth it is worth writing.
   */
  readonly enclosing: readonly Enclosing[];
}

/** One event binding that reads at least one `$name`. */
interface Reader {
  readonly attr: Attribute;
  readonly element: ElementNode;
  readonly eventName: string;
  readonly at: Span;
  readonly reads: readonly { readonly name: string; readonly at: Span }[];
}

/** Everything one walk of the tree gathers. */
interface Collected {
  readonly markers: readonly Marker[];
  readonly readers: readonly Reader[];
  /** Nearest ancestor element, control bodies seen through. The chain the pairing walks up. */
  readonly parentOf: ReadonlyMap<ElementNode, ElementNode>;
  readonly readersOf: ReadonlyMap<ElementNode, readonly Reader[]>;
  readonly diagnostics: readonly Diagnostic[];
}

/** Pair every marker with its reader, over one walk of `roots`. */
export function planDelegation(
  source: string,
  roots: readonly HtmlContent[],
  js: DelegationJs,
): DelegationPlan {
  const collected = collect(source, roots, js);
  if (collected.markers.length === 0 && collected.readers.length === 0) {
    return collected.diagnostics.length === 0 ? EMPTY : { ...EMPTY, diagnostics: collected.diagnostics };
  }
  return pair(collected);
}

// ---------------------------------------------------------------------------
// Collection — one walk over the tree
// ---------------------------------------------------------------------------

function collect(source: string, roots: readonly HtmlContent[], js: DelegationJs): Collected {
  const markers: Marker[] = [];
  const readers: Reader[] = [];
  const parentOf = new Map<ElementNode, ElementNode>();
  const readersOf = new Map<ElementNode, Reader[]>();
  const diagnostics: Diagnostic[] = [];
  /**
   * The `$name` nodes an event binding is ALLOWED to hold, by the expression that holds them.
   *
   * The walk fires `element` before the bindings of that same element, so by the time an
   * expression comes round its handler has already said which of its `$name` are arguments.
   * Everything else — a `class:` value, an interpolation, a `$day` inside a lambda — has no
   * entry here, and every `$` in it is `FUD0666`.
   */
  const allowed = new Map<RazorExpression, ReadonlySet<OxcNode>>();

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
            enclosing: [...loops],
          });
          continue;
        }
        if (binding.type !== 'event') continue;

        const args = argumentReads(js, binding.value);
        if (args.length === 0) continue;
        allowed.set(binding.value, new Set(args.map((a) => a.node)));

        const start = attr.span.start + EVENT_PREFIX.length;
        const reader: Reader = {
          attr,
          element: el,
          eventName: binding.name,
          at: span(start, start + binding.name.length),
          reads: args.map((a) => ({ name: a.name, at: a.at })),
        };
        readers.push(reader);
        readersOf.set(el, [...(readersOf.get(el) ?? []), reader]);
      }
    },
    // Every expression of an attribute, the handler of an event binding included: what the
    // handler declared as arguments is exempt, and everything else is a `$name` written where
    // the emit builds no scope for it.
    binding(expr) {
      strayDollars(js, expr, allowed.get(expr), diagnostics);
    },
    interpolation(expr) {
      strayDollars(js, expr, undefined, diagnostics);
    },
  });

  return { markers, readers, parentOf, readersOf, diagnostics };
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
 * The `$name` arguments of one handler.
 *
 * Only the DIRECT arguments of the outermost call count, and that is not a simplification: the
 * emit writes `fn($event, $z0())`, so a `$day` buried in a lambda — `@(() => f($day))` — is a
 * name in a scope the wrapper does not build. Reporting it is the difference between a
 * diagnostic and a `ReferenceError` in the browser.
 */
function argumentReads(
  js: DelegationJs,
  value: RazorExpression,
): readonly { readonly name: string; readonly at: Span; readonly node: OxcNode }[] {
  const root = js.valueAst(value);
  if (root === undefined || root.type !== 'CallExpression') return [];
  // A `CallExpression` has an `arguments` array: that is the node's shape, not a hope about
  // it, and guarding it would be a branch no AST can take.
  return (root['arguments'] as readonly OxcNode[])
    .filter((node) => node.type === 'Identifier' && isDollarName(String(node['name'])))
    .map((node) => ({ name: String(node['name']).slice(1), at: js.spanOf(node), node }));
}

/** `FUD0666` for every `$name` of an expression that is not one of its handler's arguments. */
function strayDollars(
  js: DelegationJs,
  expr: RazorExpression,
  exempt: ReadonlySet<OxcNode> | undefined,
  out: Diagnostic[],
): void {
  const root = js.valueAst(expr);
  if (root === undefined) return;
  visitDollars(root, (found) => {
    if (exempt?.has(found) === true) return;
    out.push(
      errorDiag(
        FUD_READ_OUTSIDE_ARGUMENTS,
        `\`${String(found['name'])}\` is only readable in the argument list of an event binding`,
        js.spanOf(found),
      ),
    );
  });
}

/** A `$`-prefixed identifier that is not `$event`, which belongs to SDD-15. */
function isDollarName(name: string): boolean {
  return name.length > 1 && name.startsWith('$') && name !== EVENT_ARGUMENT;
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

function pair(collected: Collected): DelegationPlan {
  const { markers, readers, parentOf, readersOf } = collected;
  const diagnostics = [...collected.diagnostics];
  const marks = new Map<ElementNode, DelegationMark[]>();
  const reads = new Map<Attribute, DelegationRead[]>();
  const tables: string[] = [];

  /** The nearest STRICT ancestor whose handler mentions `$name` (§3.2). */
  const readerOf = (from: ElementNode, name: string): ElementNode | undefined => {
    let at = parentOf.get(from);
    while (at !== undefined) {
      const found = (readersOf.get(at) ?? []).some((r) => r.reads.some((x) => x.name === name));
      if (found) return at;
      at = parentOf.get(at);
    }
    return undefined;
  };

  /** One table per pair of reader and name — and the same table for both ends of it. */
  const bound = new Map<string, { readonly table: string; readonly loops: ControlNode[] }>();
  const keyOf = (el: ElementNode, name: string): string => `${el.span.start} ${name}`;

  for (const marker of markers) {
    if (marker.enclosing.length === 0) {
      diagnostics.push(
        errorDiag(
          FUD_MARKER_OUTSIDE_LOOP,
          '`delegate:` is only allowed inside a loop (@foreach/@for/@while): outside one there is no row to identify',
          marker.attr.span,
        ),
      );
      continue;
    }
    // Innermost first: with two loops declaring `row`, the row a marker hands over is the one
    // whose scope it is written in, which is the same one the emit closes over.
    const declaring = [...marker.enclosing].reverse().find((at) => at.names.includes(marker.name));
    if (declaring === undefined) {
      diagnostics.push(notAHeaderBinding(marker));
      continue;
    }
    const reader = readerOf(marker.element, marker.name);
    if (reader === undefined) {
      diagnostics.push(
        errorDiag(
          FUD_NO_READER,
          `no ancestor handler reads \`$${marker.name}\`: this marker is never read`,
          marker.attr.span,
        ),
      );
      continue;
    }
    const key = keyOf(reader, marker.name);
    let entry = bound.get(key);
    if (entry === undefined) {
      entry = { table: `${TABLE_PREFIX}${tables.length}`, loops: [] };
      tables.push(entry.table);
      bound.set(key, entry);
    }
    // Two markers of the SAME loop are the ordinary case — a row has a cell and a button, and
    // both hand over the same `day`. Two LOOPS are the ambiguity: the dispatch finds a row and
    // cannot say which loop it came from, and that is true even when both iterate the same
    // type — which is what keeps this check on the AST and out of the checker (§5).
    if (entry.loops.length > 0 && !entry.loops.includes(declaring.loop)) {
      diagnostics.push(
        errorDiag(
          FUD_NAME_TWICE,
          `\`${marker.name}\` is already delegated to that handler by another loop: one name, one loop`,
          marker.attr.span,
        ),
      );
      continue;
    }
    entry.loops.push(declaring.loop);
    marks.set(marker.element, [
      ...(marks.get(marker.element) ?? []),
      { name: marker.name, table: entry.table },
    ]);
  }

  for (const reader of readers) {
    const resolved: DelegationRead[] = [];
    for (const read of reader.reads) {
      const entry = bound.get(keyOf(reader.element, read.name));
      if (entry === undefined) {
        diagnostics.push(
          errorDiag(
            FUD_NO_MARKER,
            `no descendant declares \`delegate:${read.name}\`: \`$${read.name}\` would have no row to read`,
            read.at,
          ),
        );
        continue;
      }
      resolved.push({ name: read.name, table: entry.table, at: read.at });
    }
    // A handler whose reads did not all resolve delegates nothing: it is dropped by the emit
    // rather than written with a name that is not there (§5, invariant 5).
    if (resolved.length === reader.reads.length) reads.set(reader.attr, resolved);

    // Only a handler that delegates needs its event to bubble: the same `@mouseenter` with no
    // `$name` is an ordinary listener on that very element, and stays legal.
    const substitute = NON_BUBBLING.get(reader.eventName);
    if (substitute === undefined) continue;
    const advice = substitute === null ? '' : `, use \`@${substitute}\``;
    diagnostics.push(
      errorDiag(
        FUD_EVENT_DOES_NOT_BUBBLE,
        `\`${reader.eventName}\` does not bubble, so it can never be delegated${advice}`,
        reader.at,
      ),
    );
  }

  return { diagnostics, marks, reads, tables };
}

function notAHeaderBinding(marker: Marker): Diagnostic {
  // Every enclosing loop's names and not only the innermost's: with nested loops, all of them
  // are in scope here, so all of them are what the author may have meant.
  const names = [...new Set(marker.enclosing.flatMap((at) => at.names))];
  const available = names.map((name) => `\`${name}\``).join(', ');
  const offer =
    available.length > 0
      ? `this loop declares ${available}`
      : 'this loop declares no binding to delegate';
  return errorDiag(
    FUD_NOT_A_HEADER_BINDING,
    `\`${marker.name}\` is not a binding of the loop header: ${offer}`,
    marker.nameSpan,
  );
}
