/**
 * The client chunk of a ROUTE (SDD-39 §3.4, §4.2, §4.3) — the half of a page that until now
 * did not exist.
 *
 * It is the component chunk with three differences and no fourth:
 *
 * - **no `c`.** A component can be born hot because its parent mounts it; a route always
 *   comes from the server, so there is no fabricate path and no `$m` to mount one.
 * - **`$root` is the `<body>`**, where a component receives its `shadowRoot`. There is no
 *   element of a route's own to adopt: fabricating one would be a custom element spending
 *   most of its life in `:not(:defined)`, and the only node the layout is obliged to write
 *   is the body (§4.2).
 * - **`$data`** takes a fixed slot ahead of the cells: what `load()` returned, trimmed to
 *   what this half actually reads (§4.8).
 *
 * Everything else is shared with the component branch, which is the point: the same markup
 * walk, the same blocks, the same hookup, the same cells. A route behaves like a component.
 */

import type { HtmlContent } from '../html/index.js';
import { CodeWriter } from './writer.js';
import { ClientMarkupEmitter, coreUsage, nodeIds, NOTHING_AHEAD, type Tail } from './markup-client.js';
import { BlockEmitter, blockContext, newBodies, releaseCalls } from './block.js';
import { AssetLinker } from './assets.js';
import { codeOf, type ExtractedCode } from './oxc-code.js';
import { hookupContext, templateDelegationJs } from './events.js';
import { planDelegation } from '../semantic/delegation.js';
import { planControls } from './controls.js';
import { NO_BOXES, rootContext } from './display.js';
import { childTargets, entryCellSlots, entryReactiveScope, type CellSlot } from './state.js';
import { entryHalf, entryMoving, isReactiveRoute } from './level.js';
import { cellNameAt, lines, withCells, writeClosure } from './client.js';
import { composePage, holeContent, type ComposeItem } from './compose.js';
import { styledTags, type EmitOptions, type EmitOutput } from './module.js';
import type { DocumentGraph } from './resolve.js';
import type { RouteDocument, PageDocument } from '../document/index.js';
import type { Diagnostic } from '../types/index.js';

/**
 * The three leading slots of a route's array: `$dom`, `$root` and `$data`. One more than a
 * component's, which is the whole of what `$data` costs anybody.
 */
const ROUTE_BASE = 3;

/** The name a cell arrives under, inside the `$` reserve of SDD-15 §4.7. */
const cellName = (cell: CellSlot): string => cellNameAt(cell, ROUTE_BASE);

/**
 * The cursor of one LAYOUT level, and the node one `enter` step held.
 *
 * Inside the `$` reserve of SDD-15 §4.7, and clear of every name the rest of the emit hands
 * out inside this same closure — `$k` is a construct's live-instance registry, `$q` its
 * branch selector, `$n` a node of the route's own walk.
 */
const layoutCursor = (depth: number): string => `$lc${depth}`;
const layoutNode = (id: number): string => `$lp${id}`;

/**
 * Walk one level of the composed page, writing the cursor steps into the adopt body and
 * handing every hole to the markup emitter (§4.3).
 *
 * The cursor is the level's, shared by the layout's steps and the route's own nodes: the
 * route's elements are siblings of the layout's, so a hole has to leave the cursor standing
 * where the route stopped. Crossing the layout is `nextElementSibling` and nothing else — not
 * one slice of its source reaches the output, which is what keeps the chunk's map at one
 * `sources` entry (§6.6).
 */
class ComposeWalker {
  readonly #adopt: CodeWriter;
  readonly #em: ClientMarkupEmitter;
  readonly #route: RouteDocument | PageDocument;
  #nodes = 0;

  constructor(adopt: CodeWriter, em: ClientMarkupEmitter, route: RouteDocument | PageDocument) {
    this.#adopt = adopt;
    this.#em = em;
    this.#route = route;
  }

  level(items: readonly ComposeItem[], parent: string, depth: number): void {
    const cursor = layoutCursor(depth);
    // Always a cursor, and never a guard for an empty level: a level exists because it holds
    // a hole — that is what `enter` means — and the hole walks the route's elements with it.
    this.#adopt.line(`let ${cursor} = $dom.firstElementChild(${parent});`);
    items.forEach((item, i) => {
      // What the LAYOUT still has ahead of this point, which is what locates a trailing text
      // run of the route: with something after it the run is the cursor's previous sibling,
      // and only with nothing after it is it the last child of the parent.
      const ahead: Tail = i + 1 < items.length ? { element: true, any: true } : NOTHING_AHEAD;
      switch (item.kind) {
        case 'skip':
          this.#adopt.line(`${cursor} = $dom.nextElementSibling(${cursor});`);
          break;
        case 'enter': {
          const node = layoutNode(this.#nodes++);
          this.#adopt.line(`const ${node} = ${cursor};`);
          this.#adopt.line(`${cursor} = $dom.nextElementSibling(${cursor});`);
          // Braces so the inner cursor is scoped, exactly as a component's own descent does.
          this.#adopt.line('{').indent();
          this.level(item.items, node, depth + 1);
          this.#adopt.dedent().line('}');
          break;
        }
        default:
          this.#em.emitHole(this.#content(item.hole), parent, cursor, ahead);
          break;
      }
    });
  }

  #content(hole: Parameters<typeof holeContent>[1]): readonly HtmlContent[] {
    // A page owns its `<body>` and declares no section: its one hole is its body.
    return this.#route.type === 'route-document'
      ? holeContent(this.#route, hole)
      : this.#route.body.children;
  }
}

function buildRouteClientModule(
  graph: DocumentGraph,
  options: EmitOptions,
): { writer: CodeWriter; linker: AssetLinker; diagnostics: readonly Diagnostic[] } | null {
  if (!isReactiveRoute(graph)) return null;
  const entry = graph.entry as RouteDocument | PageDocument;
  const source = graph.entrySource;
  const half = entryHalf(graph)!;
  const { code, roots } = half;
  const linker = new AssetLinker(options.linkAssets ?? false, options.assetExists);
  const cells = entryCellSlots(graph, half);

  const bodies = newBodies();
  const emitDiagnostics: Diagnostic[] = [];
  // Everything below is the component branch's, read from the entry instead of from a
  // `ResolvedComponent`. Where the two could answer differently, they do not: the same
  // functions, over the same graph.
  const scope = {
    childProps: (tag: string) => {
      const child = graph.components.get(tag);
      return child === undefined ? undefined : codeOf(child).props;
    },
    declared: childTargets(graph),
    cellOf: (name: string): string | undefined => {
      const cell = cells.find((c) => c.name === name && c.kind === 'fn');
      return cell === undefined ? undefined : cellName(cell);
    },
    signals: entryReactiveScope(half),
    moving: entryMoving(code),
    styled: styledTags(graph),
  };
  const delegation = planDelegation(source, roots, templateDelegationJs(code.template));
  emitDiagnostics.push(...delegation.diagnostics);
  const hookup = hookupContext(
    code.template,
    emitDiagnostics,
    new Set<string>(), // a route has no props, so it receives no callback by cell
    planControls(source, roots, (t) => graph.components.has(t)),
    new Set<string>(), // and no `control` node can have crossed into it
    delegation,
  );
  for (const table of delegation.tables) bodies.decls.line(`const ${table} = new WeakMap();`);
  const ids = nodeIds();
  const usage = coreUsage();
  const ctx = blockContext(source, scope, linker, ids, usage, hookup);
  // The same defaults the SERVER branch of a route starts from (`buildRouteModule` builds its
  // `MarkupEmitter` with no space, no container and no boxes): the two walks have to drop the
  // same whitespace nodes, or `h` adopts a tree that is one node out of step.
  const em = new ClientMarkupEmitter({
    source,
    bodies,
    scope,
    linker,
    sink: new BlockEmitter(ctx, scope.moving),
    ids,
    usage,
    hookup,
    at: rootContext('collapse', 'unknown', NO_BOXES),
  });
  for (const cell of cells) {
    if (cell.kind === 'fn') bodies.hook.line(`${cellName(cell)}?.set(${cell.name});`);
  }
  new ComposeWalker(bodies.adopt, em, entry).level(composePage(graph), '$root', 0);

  const reactive = code.signals.flatMap((s) => (s.kind === 'signal' ? [s.name] : []));
  const imported = code.clientImports;
  const renews = (reactive.length > 0 || imported.length > 0) && (em.writes > 0 || !bodies.update.empty);
  const reconcile = bodies.update.empty ? '' : ` ${lines(bodies.update)}`;
  if (renews) {
    usage.subscribes = reactive.length > 0;
    usage.guarded = imported.length > 0;
    for (const name of reactive) bodies.hook.line(`$d.push($sub(${name}, $u));`);
    for (const name of imported) bodies.hook.line(`$d.push($subIf(${name}, $u));`);
  }

  const w = new CodeWriter();
  const channels = [
    ...(usage.subscribes ? ['subscribe as $sub'] : []),
    ...(usage.guarded ? ['subscribeIf as $subIf'] : []),
    ...(usage.fabricates ? ['live as $live'] : []),
  ];
  if (channels.length > 0) w.line(`import { ${channels.join(', ')} } from '@fudic/core';`);
  if (hookup.binds.size > 0) {
    w.line(`import { ${[...hookup.binds].sort().join(', ')} } from '@fudic/forms/dom';`);
  }
  writeImports(w, code);
  for (const line of linker.imports()) w.line(line);
  w.line('');
  // A default export and NOT a custom element: a route is not defined, not instantiated and
  // never fabricated hot. What the runtime holds is this function and the three entry points
  // it returns.
  w.line('export default ($props) => {');
  w.indent();
  if (em.nodes.length > 0) w.line(`let ${em.nodes.join(', ')};`);
  w.line('const $d = []; // teardowns');
  if (em.writes > 0) w.line('const $w = []; // last applied, per value write');
  w.line(declaration(cells));
  writeBody(w, code, cells);
  w.line('');
  w.appendWriter(bodies.decls);
  writeClosure(w, '$s', bodies.hook);
  writeClosure(w, '$a', bodies.apply, 'let $v;');
  if (renews) w.line(`const $u = () => { $a();${reconcile} };`);
  w.line('');
  w.line('return {');
  w.indent();
  // Adopt → hook up, exactly as a component's `h`: the structure came from the server and
  // the payload stays the authority on state, so nothing is applied and nothing is mounted.
  w.line('h: () => {');
  w.indent();
  w.appendWriter(bodies.adopt);
  w.line('$s();');
  w.dedent();
  w.line('},');
  // A route declares no props, so `u` carries nothing positional: it is the pass itself, for
  // whoever holds a cell of this route and writes to it.
  //
  // And there is no `$cb` either, for a reason that is structural rather than an omission: a
  // rebind exists for a `control` whose NODE arrived as a prop (SDD-34 §4.6), and nobody
  // hands a route props. Every `control` a route writes is one it already holds.
  const pass = renews ? '$u();' : `$a();${reconcile}`;
  w.line(`u: () => { ${pass} },`);
  w.line(
    `r: () => { ${releaseCalls(bodies.registries)}${[...em.nodes, '$root'].join(' = ')} = null; $d.forEach((d) => d()); },`,
  );
  w.dedent();
  w.line('};');
  w.dedent();
  w.line('};');
  return { writer: w, linker, diagnostics: [...code.diagnostics, ...emitDiagnostics] };
}

/**
 * The positional intake: `$dom`, the `<body>`, the trimmed `data`, then one slot per cell.
 *
 * `let` and not `const`, for the reason a component's is: `r()` releases `$root` along with
 * the nodes, and handing over is delivering the whole state.
 */
function declaration(cells: readonly CellSlot[]): string {
  const slots = cells.map((c) => cellName(c));
  return `let [$dom, $root, $data${slots.map((n) => `, ${n}`).join('')}] = $props;`;
}

/** The hoisted imports of both zones — an `import` is only legal at module scope. */
function writeImports(w: CodeWriter, code: ExtractedCode): void {
  for (const statement of code.neutral) {
    if (statement.hoisted) {
      w.mappedLine({ text: statement.text, src: statement.at, anchors: statement.anchors });
    }
  }
  for (const line of code.client.imports) w.line(line);
}

/**
 * The author's own code, in the order it was written: the neutral zone, which runs on both
 * sides, and then `@client`, which runs only here.
 *
 * `mappedLine` for both, because this is where a breakpoint set in the `.fud` has to land —
 * `withCells` splices within a line and never adds one, so line k still means line k.
 */
function writeBody(w: CodeWriter, code: ExtractedCode, cells: readonly CellSlot[]): void {
  // `data`, under the name the author writes it by — the same one the render module's
  // `page(data, io)` binds, so a `@client` handler reads it by the name it was written with.
  w.line('const data = $data;');
  for (const statement of code.neutral) {
    if (!statement.hoisted && !statement.provides) {
      w.mappedLine({ text: statement.text, src: statement.at, anchors: statement.anchors });
    }
  }
  for (const statement of code.client.body) {
    w.mappedLine({
      text: withCells(statement, code.signals, cells, ROUTE_BASE),
      src: statement.at,
      anchors: statement.anchors,
    });
  }
}

/** The client chunk of a route: its `@client` half, adopting the composed page from `<body>`. */
export function emitRouteClientModule(
  graph: DocumentGraph,
  options: EmitOptions = {},
): string | null {
  return buildRouteClientModule(graph, options)?.writer.toString() ?? null;
}

/** As `emitRouteClientModule`, plus the output↔source mappings and missing assets. */
export function emitRouteClientModuleMapped(
  graph: DocumentGraph,
  options: EmitOptions = {},
): EmitOutput | null {
  const built = buildRouteClientModule(graph, options);
  if (built === null) return null;
  return {
    code: built.writer.toString(),
    mappings: built.writer.mappings(),
    missingAssets: built.linker.missing(),
    diagnostics: built.diagnostics,
  };
}
