/**
 * `delegation` (SDD-37 §5): the seven rules that tie a `delegate:name` marker to the `$name`
 * an ancestor's handler reads.
 *
 * The scope is INVERTED and that is the whole of why this is one analyzer and not seven: the
 * child declares and the ancestor consumes, so no rule here can be decided from one node. Five
 * of the codes are about a PAIR — a marker with no reader, a reader with no marker, two loops
 * offering the same name to the same reader — and a pass that walked once per code would have
 * to build the same two lists five times.
 *
 * **No TypeScript.** Every question is answered over the AST: the names come from the loop
 * header's pattern, the reads from the argument list of the handler's call, and the pairing
 * from the element tree. That is the promise of §4.5 — the checker types `$day`, it never
 * decides whether `$day` is legal — and it is what keeps this off the language server's hot
 * path.
 */

import { errorDiag, span, type Diagnostic, type Span } from '../../types/index.js';
import { classifyAttribute } from '../../binding/index.js';
import { loopHeaderNames, type OxcNode } from '../../oxc/index.js';
import type { RazorExpression } from '../../at/index.js';
import type { ElementNode } from '../../html/index.js';
import type { ControlNode, ForeachNode, ForNode, WhileNode } from '../../control/index.js';
import type { Analyzer, SemanticInput, Report } from '../model.js';
import { documentRoots, walk } from '../walk.js';

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

/** The three constructs that iterate. `emit/constructs.ts` names the same union, and the two
 * cannot share it: this pass is what the emit imports from, never the other way round. */
type LoopNode = ForeachNode | ForNode | WhileNode;

/** One enclosing loop and the names its header declares. */
interface Enclosing {
  readonly loop: LoopNode;
  readonly names: readonly string[];
}

/** A `delegate:name` marker, with every loop it sits in, outermost first. */
interface Marker {
  readonly name: string;
  readonly attrSpan: Span;
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

/** One `$name` written in the argument list of an event binding. */
interface Read {
  readonly name: string;
  readonly at: Span;
  readonly element: ElementNode;
}

/** One event binding that reads at least one `$name`. */
interface Reader {
  readonly eventName: string;
  readonly at: Span;
  readonly names: ReadonlySet<string>;
}

export const delegation: Analyzer = {
  name: 'delegation',
  run(input, report) {
    pair(collect(input, report), report);
  },
};

// ---------------------------------------------------------------------------
// Collection — one walk over the tree
// ---------------------------------------------------------------------------

interface Collected {
  readonly markers: readonly Marker[];
  readonly reads: readonly Read[];
  /** Nearest ancestor element, control bodies seen through. The chain `pair` walks up. */
  readonly parentOf: ReadonlyMap<ElementNode, ElementNode>;
  /** The event bindings of an element that read at least one `$name`. */
  readonly readersOf: ReadonlyMap<ElementNode, readonly Reader[]>;
}

function collect(input: SemanticInput, report: Report): Collected {
  const markers: Marker[] = [];
  const reads: Read[] = [];
  const parentOf = new Map<ElementNode, ElementNode>();
  const readersOf = new Map<ElementNode, Reader[]>();
  /**
   * The `$name` nodes an event binding is ALLOWED to hold, by the expression that holds them.
   *
   * The walk fires `element` before the bindings of that same element, so by the time an
   * expression comes round its handler has already said which of its `$name` are arguments.
   * Everything else — a `class:` value, an interpolation, a `$day` inside a lambda — has no
   * entry here and every `$` in it is `FUD0666`.
   */
  const allowed = new Map<RazorExpression, ReadonlySet<OxcNode>>();

  const loops: Enclosing[] = [];

  walk(documentRoots(input.document), {
    // `control` fires for every construct before its bodies are descended, and `exitLoop`
    // fires for the three that iterate. Reading the discriminant here is what keeps the two
    // in step: an `@if` is pushed by neither and popped by neither.
    control(node) {
      if (isLoop(node)) loops.push({ loop: node, names: headerNamesOf(input, node) });
    },
    exitLoop() {
      loops.pop();
    },
    element(el, host) {
      if (host !== undefined) parentOf.set(el, host);
      for (const attr of el.attributes) {
        const classified = classifyAttribute(attr, input.source);
        const binding = classified.value;
        if (binding.type === 'delegate') {
          // `FUD0667` is decided by the classification (SDD-07's layer) and would otherwise be
          // seen by `pnpm build` alone — the very split BUG-23 spent a month closing for
          // `FUD0291`. Forwarding it here is what puts all eight in one place, and the rule
          // still has exactly one definition.
          for (const diagnostic of classified.diagnostics) report(diagnostic);
          markers.push({
            name: binding.name,
            attrSpan: attr.span,
            nameSpan: binding.nameSpan,
            element: el,
            enclosing: [...loops],
          });
          continue;
        }
        if (binding.type !== 'event') continue;

        const args = argumentReads(input, binding.value);
        if (args.length === 0) continue;
        allowed.set(binding.value, new Set(args.map((a) => a.node)));

        for (const arg of args) reads.push({ name: arg.name, at: arg.at, element: el });
        const start = attr.span.start + EVENT_PREFIX.length;
        const readers = readersOf.get(el) ?? [];
        readers.push({
          eventName: binding.name,
          at: span(start, start + binding.name.length),
          names: new Set(args.map((a) => a.name)),
        });
        readersOf.set(el, readers);
      }
    },
    // Every expression of an attribute, the handler of an event binding included: what the
    // handler declared as arguments is exempt, and everything else is a `$name` written
    // where the emit builds no scope for it.
    binding(expr) {
      reportStrayDollars(input, expr, allowed.get(expr), report);
    },
    interpolation(expr) {
      reportStrayDollars(input, expr, undefined, report);
    },
  });

  return { markers, reads, parentOf, readersOf };
}

/** The three constructs that iterate — the only ones a marker may sit in (decision 116). */
function isLoop(node: ControlNode): node is LoopNode {
  return node.type === 'foreach' || node.type === 'for' || node.type === 'while';
}

/** What the header of the loop a marker sits in declares — the list `FUD0662` checks against. */
function headerNamesOf(input: SemanticInput, loop: LoopNode): readonly string[] {
  const root = astOf(input, loop);
  return root === undefined ? [] : loopHeaderNames(root, loop.type);
}

/**
 * The single-node AST of a fragment, or `undefined`.
 *
 * A fragment that failed to parse has `FUD0170` already and one nobody registered cannot be
 * asked about: silence is the honest answer in both cases, not a complaint about a value this
 * pass could not read.
 */
function astOf(input: SemanticInput, node: RazorExpression | ControlNode): OxcNode | undefined {
  const id = input.fragmentId(node);
  if (id === undefined) return undefined;
  const root = input.js.ast(id);
  return Array.isArray(root) ? undefined : (root as OxcNode);
}

// ---------------------------------------------------------------------------
// What a handler reads (§4.1), and `FUD0666` for a `$name` written anywhere else
// ---------------------------------------------------------------------------

/**
 * The `$name` arguments of one handler.
 *
 * Only the DIRECT arguments of the outermost call count, and that is not a simplification: the
 * emit writes `fn($event, $z0())`, so a `$day` buried in a lambda — `@(() => f($day))` — is a
 * name in a scope the wrapper does not build. Reporting it is the difference between a
 * diagnostic and a `ReferenceError` in the browser.
 */
function argumentReads(
  input: SemanticInput,
  value: RazorExpression,
): readonly { readonly name: string; readonly at: Span; readonly node: OxcNode }[] {
  const root = astOf(input, value);
  if (root === undefined || root.type !== 'CallExpression') return [];
  // A `CallExpression` has an `arguments` array: that is the node's shape, not a hope about
  // it, and guarding it would be a branch no AST can take.
  return (root['arguments'] as readonly OxcNode[])
    .filter((node) => node.type === 'Identifier' && isDollarName(String(node['name'])))
    .map((node) => ({
      name: String(node['name']).slice(1),
      at: input.js.mapSpan(node.start, node.end),
      node,
    }));
}

/** `FUD0666` for every `$name` of an expression that is not one of its handler arguments. */
function reportStrayDollars(
  input: SemanticInput,
  expr: RazorExpression,
  exempt: ReadonlySet<OxcNode> | undefined,
  report: Report,
): void {
  const root = astOf(input, expr);
  if (root === undefined) return;
  visitDollars(root, (found) => {
    if (exempt?.has(found) === true) return;
    report(
      errorDiag(
        FUD_READ_OUTSIDE_ARGUMENTS,
        `\`${String(found['name'])}\` is only readable in the argument list of an event binding`,
        input.js.mapSpan(found.start, found.end),
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

function pair(collected: Collected, report: Report): void {
  const { markers, reads, parentOf, readersOf } = collected;

  /** The nearest STRICT ancestor whose handler mentions `$name` (§3.2). */
  const readerOf = (from: ElementNode, name: string): ElementNode | undefined => {
    let at = parentOf.get(from);
    while (at !== undefined) {
      if ((readersOf.get(at) ?? []).some((reader) => reader.names.has(name))) return at;
      at = parentOf.get(at);
    }
    return undefined;
  };

  // Which loops feed one name to one reader. `FUD0660` asks it the other way round, and
  // `FUD0664` is the moment a second loop appears in a list.
  const bound = new Map<string, ControlNode[]>();
  const keyOf = (el: ElementNode, name: string): string => `${el.span.start} ${name}`;

  for (const marker of markers) {
    if (marker.enclosing.length === 0) {
      report(
        errorDiag(
          FUD_MARKER_OUTSIDE_LOOP,
          '`delegate:` is only allowed inside a loop (@foreach/@for/@while): outside one there is no row to identify',
          marker.attrSpan,
        ),
      );
      continue;
    }
    // Innermost first: with two loops declaring `row`, the row a marker hands over is the one
    // whose scope it is written in, which is the same one the emit closes over.
    const declaring = [...marker.enclosing].reverse().find((at) => at.names.includes(marker.name));
    if (declaring === undefined) {
      report(notAHeaderBinding(marker));
      continue;
    }
    const reader = readerOf(marker.element, marker.name);
    if (reader === undefined) {
      report(
        errorDiag(
          FUD_NO_READER,
          `no ancestor handler reads \`$${marker.name}\`: this marker is never read`,
          marker.attrSpan,
        ),
      );
      continue;
    }
    const key = keyOf(reader, marker.name);
    const loops = bound.get(key) ?? [];
    // Two markers of the SAME loop are the ordinary case — a row has a cell and a button, and
    // both hand over the same `day`. Two LOOPS are the ambiguity: the dispatch finds a row and
    // cannot say which loop it came from, and that is true even when both iterate the same
    // type — which is what keeps this check on the AST and out of the checker (§5).
    if (loops.length > 0 && !loops.includes(declaring.loop)) {
      report(
        errorDiag(
          FUD_NAME_TWICE,
          `\`${marker.name}\` is already delegated to that handler by another loop: one name, one loop`,
          marker.attrSpan,
        ),
      );
      continue;
    }
    loops.push(declaring.loop);
    bound.set(key, loops);
  }

  for (const read of reads) {
    if (bound.has(keyOf(read.element, read.name))) continue;
    report(
      errorDiag(
        FUD_NO_MARKER,
        `no descendant declares \`delegate:${read.name}\`: \`$${read.name}\` would have no row to read`,
        read.at,
      ),
    );
  }

  // Only a handler that delegates needs its event to bubble: the same `@mouseenter` with no
  // `$name` is an ordinary listener on that very element, and stays legal.
  for (const readers of readersOf.values()) {
    for (const reader of readers) {
      const substitute = NON_BUBBLING.get(reader.eventName);
      if (substitute === undefined) continue;
      const advice = substitute === null ? '' : `, use \`@${substitute}\``;
      report(
        errorDiag(
          FUD_EVENT_DOES_NOT_BUBBLE,
          `\`${reader.eventName}\` does not bubble, so it can never be delegated${advice}`,
          reader.at,
        ),
      );
    }
  }
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
