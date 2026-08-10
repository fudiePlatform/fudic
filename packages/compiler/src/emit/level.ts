/**
 * WHO HYDRATES — the effective level of a component, as one predicate over the graph
 * (SDD-15 §3.1, §3.2).
 *
 * The rule used to be «it declares a signal», and it was short by both ends. By the top,
 * because `computed(...)` is as reactive as `signal(...)` and lives in the same list
 * (`ExtractedCode.signals`, SDD-31 §4.7). By the bottom, because a component with a
 * `@click` and no signal at all still has to hydrate — the button does not respond
 * otherwise — and so does one with nothing of its own that receives a reactive prop from
 * its parent.
 *
 * **The error has a direction, and it is deliberate.** This is an OVERAPPROXIMATION: a
 * `@code { @client }` holding nothing but `const x = 5` marks the component hydratable and
 * produces a `data-fud-id` nobody reads. That is accepted. Hydrating too much costs a slot
 * in the payload and a chunk downloaded during an interaction that was going to happen
 * anyway; hydrating too little is a component that does not respond, and there is NO
 * possible diagnostic for it — the compiler cannot know that a `setInterval` inside
 * `@client` moves something. The burden of proof is on NOT hydrating.
 *
 * **What the rule does not attempt.** It does not look at whether the signal is ever read,
 * at whether the handler does anything, or at any type. All of that is flow analysis, and
 * the place for flow analysis is the language server (SDD-24), not the emit.
 */

import type { ComponentGraph, ResolvedComponent } from './resolve.js';
import type { ElementNode, HtmlContent } from '../html/index.js';
import type { ControlNode } from '../control/index.js';
import { classifyAttribute } from '../binding/index.js';
import { branchesOf } from './constructs.js';
import { codeOf } from './oxc-code.js';
import { reactiveName } from './attrs.js';

/**
 * Every `ElementNode` a COMPONENT TEMPLATE can render, however deep and through whatever
 * construct. A branch of an `@if` and a body of a `@foreach` hold hosts just like the top
 * level does, and a level rule that only looked at the top level would leave every
 * conditional component un-hydrated.
 *
 * A `@section` is not walked because a component cannot declare one: sections belong to a
 * route, and SDD-10 reports one written here before the emit ever sees it.
 */
export function walkElements(nodes: readonly HtmlContent[], visit: (el: ElementNode) => void): void {
  for (const node of nodes) {
    switch (node.type) {
      case 'element': {
        const el = node as ElementNode;
        visit(el);
        walkElements(el.children, visit);
        break;
      }
      case 'if':
      case 'switch':
      case 'foreach':
      case 'for':
      case 'while':
        for (const branch of branchesOf(node as unknown as ControlNode)) {
          walkElements(branch.body, visit);
        }
        break;
      default:
        // Text, comments, interpolations, `@code`, the `Render*` markers, `@section` and
        // the degraded nodes: none of them is or holds an element of this template.
        break;
    }
  }
}

/** The template of a component — the shadow tree it declares, never a light-DOM child. */
const templateOf = (comp: ResolvedComponent): readonly HtmlContent[] =>
  comp.doc.template?.children ?? [];

/** Whether any binding of this template is hookup: an `@evento` or a `bus:`. */
function hasHookup(comp: ResolvedComponent): boolean {
  let found = false;
  walkElements(templateOf(comp), (el) => {
    for (const attr of el.attributes) {
      const b = classifyAttribute(attr, comp.source).value;
      if (b.type === 'event' || b.type === 'bus') found = true;
    }
  });
  return found;
}

/**
 * The INTRINSIC half of the rule: what a component says about itself, decided on the AST
 * and never on text.
 *
 * A reactive declaration (`signal` **or** `computed` — the same list on purpose, because
 * the question that list answers, «can this move?», has one answer for both), a hookup
 * binding in its template, or a `@code { @client }` with a body.
 */
export function isIntrinsicallyHydratable(comp: ResolvedComponent): boolean {
  const code = codeOf(comp);
  return code.signals.length > 0 || code.client.body.length > 0 || hasHookup(comp);
}

/** The component hosts of a component's own template, as `(host element, child tag)`. */
function componentHosts(
  graph: ComponentGraph,
  comp: ResolvedComponent,
  visit: (el: ElementNode, child: ResolvedComponent) => void,
): void {
  walkElements(templateOf(comp), (el) => {
    const child = graph.components.get(el.name);
    if (child !== undefined) visit(el, child);
  });
}

/**
 * The tags of the graph that hydrate — the least set closed under the induced rule.
 *
 * Seed: the intrinsic ones. Then, until it stabilizes: a hydratable component that crosses
 * a REACTIVE value to a child host makes that child hydratable, and the prop it lands on
 * is itself reactive in the child — which is what makes the rule transitive. That is
 * *property drilling*, and without the transitive half a grandchild freezes with nothing
 * saying so.
 *
 * It terminates: the set only grows, and it is bounded by the catalogue. It is
 * deterministic: the iteration order is `graph.components`, which already is.
 */
export function hydratableTags(graph: ComponentGraph): ReadonlySet<string> {
  const hydratable = new Set<string>();
  for (const comp of graph.components.values()) {
    if (isIntrinsicallyHydratable(comp)) hydratable.add(comp.tag);
  }
  // Per tag, the props it receives as reactive. They join its own declarations when asking
  // what a naked `@name` in ITS template refers to: a forwarded prop is as reactive as a
  // signal for the only purpose this file has.
  const reactiveProps = new Map<string, Set<string>>();

  let changed = true;
  while (changed) {
    changed = false;
    for (const comp of graph.components.values()) {
      if (!hydratable.has(comp.tag)) continue;
      const reactives = new Set<string>([
        ...codeOf(comp).signals.map((s) => s.name),
        ...(reactiveProps.get(comp.tag) ?? []),
      ]);
      componentHosts(graph, comp, (el, child) => {
        for (const attr of el.attributes) {
          const b = classifyAttribute(attr, comp.source).value;
          if (b.type !== 'property') continue;
          if (reactiveName(comp.source, b.value, reactives) === undefined) continue;
          const landed = reactiveProps.get(child.tag) ?? new Set<string>();
          if (!hydratable.has(child.tag) || !landed.has(b.name)) changed = true;
          hydratable.add(child.tag);
          landed.add(b.name);
          reactiveProps.set(child.tag, landed);
        }
      });
    }
  }
  return hydratable;
}
