/**
 * The harness for the one thing the emit cannot assert about itself: that the tree the
 * SERVER painted is, node for node, the tree the CLIENT adopts.
 *
 * Everything else about the client emit is checked on its text (`client.test.ts`) or locked
 * byte for byte (`golden.test.ts`). Neither of those can catch the failure that matters —
 * a whitespace rule, a walk order or a cursor step that differs by one between the two
 * branches — because both branches would still look perfectly reasonable in isolation. So
 * this runs them: `render()` against `SsrDom`, serialize, parse that HTML into a real DOM,
 * and drive the emitted `static c($props)` over it.
 *
 * The client chunk is evaluated rather than imported: it is bundler input, and its
 * `import { FudicElement } from '@fudic/core'` would need a resolvable module graph on
 * disk. The imports are already locked by the goldens; here they are stripped and the
 * bindings injected, so what runs is the factory itself, unmodified.
 */

import { SsrDom, renderToString } from '@fudic/ssr';
import { FudicElement, signal, type Controller, type FudicElementCtor } from '@fudic/core';
import { emit, type Dom, type DomClient } from '@fudic/dom';
import {
  emitComponentModule,
  emitComponentClientModule,
  type ComponentGraph,
} from '../../../src/emit/index.js';

/** A component's server render, as the emitted module exports it. */
export type ServerRender = (dom: unknown, shadow: unknown, props: unknown) => void;

const IMPORT_RENDER = /^import \{ render as (\w+) \} from '\.\/([a-z0-9-]+)\.mjs';$/gmu;

const serverRenders = new Map<ComponentGraph, Map<string, ServerRender>>();

/**
 * Every server `render` of a graph, evaluated in dependency order.
 *
 * A component module imports its children by specifier, so it cannot be evaluated alone —
 * but the specifiers are the emit's own sibling-file convention, so the graph is right
 * here: strip the imports, hand the child renders in as bindings, and evaluate the leaves
 * first. Going through the filesystem instead would put a temp path into the module graph
 * of the test runner, which is not where a temp path belongs.
 */
function serverRendersOf(graph: ComponentGraph): Map<string, ServerRender> {
  const cached = serverRenders.get(graph);
  if (cached !== undefined) return cached;

  const sources = new Map<string, string>();
  for (const comp of graph.components.values()) {
    sources.set(comp.tag, emitComponentModule(graph, comp));
  }
  const out = new Map<string, ServerRender>();
  // Leaves first: a component whose children are all resolved can be evaluated. The graph
  // is acyclic (a cycle is a link cycle, rejected upstream), so this terminates.
  while (out.size < sources.size) {
    for (const [tag, source] of sources) {
      if (out.has(tag)) continue;
      const deps = [...source.matchAll(IMPORT_RENDER)].map((m) => ({ binding: m[1]!, tag: m[2]! }));
      if (!deps.every((d) => out.has(d.tag))) continue;
      const body = source.replace(IMPORT_RENDER, '').replace(/^export\s+/gmu, '') + '\nreturn render;';
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const make = new Function(...deps.map((d) => d.binding), body) as (
        ...renders: ServerRender[]
      ) => ServerRender;
      out.set(tag, make(...deps.map((d) => out.get(d.tag)!)));
    }
  }
  serverRenders.set(graph, out);
  return out;
}

const factories = new Map<string, FudicElementCtor>();

/**
 * The emitted factory of a component's client chunk. `customElements` is shadowed by a
 * parameter, so the chunk's own `define` call hands the class over instead of registering
 * it: the tests drive the factory directly, and `FudicElement`'s routing is already covered
 * by its own suite.
 */
export function clientFactory(graph: ComponentGraph, tag: string): FudicElementCtor {
  let factory = factories.get(tag);
  if (factory === undefined) {
    const source = emitComponentClientModule(graph, graph.components.get(tag)!);
    const body = source.replace(/^import .*$/gmu, '');
    let captured: FudicElementCtor | undefined;
    const registry = {
      define: (_name: string, ctor: FudicElementCtor): void => {
        captured = ctor;
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    new Function('FudicElement', 'signal', 'emit', 'customElements', body)(
      FudicElement,
      signal,
      emit,
      registry,
    );
    factory = captured!;
    factories.set(tag, factory);
  }
  return factory;
}

/** The HTML the server paints for one component instance: the inside of its shadow root. */
export function serverShadowHtml(graph: ComponentGraph, tag: string, props: unknown): string {
  const render = serverRendersOf(graph).get(tag)!;
  const dom = new SsrDom();
  const host = dom.element(tag);
  const shadow = dom.attachShadow(host);
  render(dom, shadow, props);
  const html = renderToString(host);
  const open = html.indexOf('>', html.indexOf('<template')) + 1;
  return html.slice(open, html.lastIndexOf('</template>'));
}

/**
 * A host in the live DOM whose shadow root holds the server's markup in the state the
 * PARSER leaves it: every `<template shadowrootmode>` consumed into a real shadow root.
 *
 * Doing that by hand is not a shortcut, it is the point. `innerHTML` never materializes a
 * declarative shadow root — only the parser does — so without this the nested `<template>`
 * would sit in the light DOM as one extra node, and the client's cursor would run off the
 * end of every level below it. Which is exactly what it did the first time this ran.
 */
export function mountAsDsd(tag: string, shadowHtml: string): { host: Element; shadow: ShadowRoot } {
  const host = document.createElement(tag);
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = shadowHtml;
  materializeShadows(shadow);
  document.body.append(host);
  return { host, shadow };
}

/** What the HTML parser does with `<template shadowrootmode>`, one level at a time. */
function materializeShadows(root: ParentNode): void {
  for (const template of [...root.querySelectorAll('template[shadowrootmode]')]) {
    const host = template.parentElement!;
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.append((template as HTMLTemplateElement).content);
    template.remove();
    materializeShadows(shadow); // a child's shadow may host a component of its own
  }
}

/** A controller over the live DOM, built from the emitted factory. */
export function controller(
  factory: FudicElementCtor,
  dom: Dom<Node>,
  shadow: ShadowRoot,
  values: readonly unknown[],
): Controller {
  return factory.c([dom, shadow, ...values]);
}

/**
 * `browserDom` with construction forbidden. Hydration ADOPTS: if a single `element`, `text`
 * or `append` runs on the `h` path, the branch is fabricating what the server already
 * painted, and the two trees have started to diverge.
 */
export function adoptOnly(dom: DomClient<Node>): DomClient<Node> {
  const forbid = (op: string) => (): never => {
    throw new Error(`hydrate must not call ${op}: it adopts, it does not build`);
  };
  return {
    ...dom,
    element: forbid('element'),
    text: forbid('text'),
    append: forbid('append'),
  };
}

/** Every way a `DomClient` can move over a tree — the whole traversal surface, traced. */
const WALK = [
  'firstChild',
  'nextSibling',
  'previousSibling',
  'childAt',
  'firstElementChild',
  'nextElementSibling',
  'lastChild',
] as const;

export type WalkOp = (typeof WALK)[number];

/**
 * `browserDom` recording every traversal call, in order. It proves two things the emitted
 * text cannot: that the walk really stepped over the tree, and — more to the point — WHICH
 * primitives it used. A hydration that reached for `childAt` or `nextSibling` would be
 * counting nodes again, and counting nodes is what the round trip through HTML breaks.
 */
export function countingSteps(dom: DomClient<Node>): { dom: DomClient<Node>; steps: WalkOp[] } {
  const steps: WalkOp[] = [];
  const traced: DomClient<Node> = { ...dom };
  for (const op of WALK) {
    // One signature covers the lot: `childAt` is the only one with a second argument, and
    // passing it through unread costs nothing.
    const inner = dom[op] as (node: Node, index: number) => Node | null;
    (traced as Record<WalkOp, unknown>)[op] = (node: Node, index: number): Node | null => {
      steps.push(op);
      return inner(node, index);
    };
  }
  return { dom: traced, steps };
}
