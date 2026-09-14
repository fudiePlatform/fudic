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

import { allComponents, componentOf, type ComponentGraph, type ResolvedComponent } from './resolve.js';
import type { ElementNode, HtmlContent } from '../html/index.js';
import type { ControlNode } from '../control/index.js';
import { classifyAttribute, isFormAssociated } from '../binding/index.js';
import { branchesOf } from './constructs.js';
import { codeOf, codeOfDocument, type ExtractedCode } from './oxc-code.js';
import { readsMoving } from './attrs.js';

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

/**
 * The template of a component — the shadow tree it declares, never a light-DOM child. A
 * degraded document has none (FUD0157), and an empty list is the honest reading of that.
 */
export const templateOf = (comp: ResolvedComponent): readonly HtmlContent[] =>
  comp.doc.template?.children ?? [];

/**
 * The two things every rule about a route's client half needs: its `@code`, and ALL the
 * markup it owns (SDD-39 §4.4).
 *
 * One pair and not two lookups, because they are always wanted together and because the
 * absence is the same absence: an entry that is a component or a layout has no client half of
 * this kind, and `undefined` says so once instead of leaving a caller to pair an empty list
 * with a missing extraction.
 *
 * The markup is ONE list — the body and every `@section` — because every rule that reads it
 * asks the same question of both: a `@click` in a section is hookup exactly as one in the body
 * is, and a signal crossing to a component in a section is the same crossing. Where each run
 * ENDS UP in the document is the layout's business, and `compose.ts` is where that is read.
 */
export interface EntryHalf {
  readonly code: ExtractedCode;
  readonly roots: readonly HtmlContent[];
}

export function entryHalf(graph: ComponentGraph): EntryHalf | undefined {
  const entry = graph.entry;
  if (entry.type === 'route-document') {
    return {
      code: codeOfDocument(graph.entrySource, entry),
      roots: [...entry.markup, ...entry.sections.flatMap((s) => s.children)],
    };
  }
  if (entry.type === 'page-document') {
    return { code: codeOfDocument(graph.entrySource, entry), roots: entry.body.children };
  }
  return undefined;
}

/**
 * Whether any binding of a run of markup is hookup — the same three the component rule reads
 * (§4.5), asked of markup that belongs to nobody's template.
 */
export function hasHookupIn(source: string, roots: readonly HtmlContent[]): boolean {
  let found = false;
  walkElements(roots, (el) => {
    for (const attr of el.attributes) {
      const b = classifyAttribute(attr, source).value;
      if (b.type === 'event' || b.type === 'bus' || b.type === 'control') found = true;
    }
  });
  return found;
}

/** Whether a run of markup carries a `control` binding — what comes up at install (§4.6). */
export function hasControlIn(source: string, roots: readonly HtmlContent[]): boolean {
  let found = false;
  walkElements(roots, (el) => {
    for (const attr of el.attributes) {
      if (classifyAttribute(attr, source).value.type === 'control') found = true;
    }
  });
  return found;
}

/**
 * Whether any binding of this template is hookup: an `@evento`, a `bus:` — or a `control`.
 *
 * A `control` counts for exactly the same reason the other two do (SDD-34 §4.8): the binding,
 * the painting of the error and the focus are BEHAVIOUR, and a component that carries one is
 * level 3 along with everything that composes its form. There is no level-1 form; pretending
 * otherwise works right up to the first error.
 */
function hasHookup(comp: ResolvedComponent): boolean {
  return hasHookupIn(comp.source, templateOf(comp));
}

/**
 * The INTRINSIC half of the rule: what a component says about itself, decided on the AST
 * and never on text.
 *
 * A reactive declaration (`signal` **or** `computed` — the same list on purpose, because
 * the question that list answers, «can this move?», has one answer for both), a hookup
 * binding in its template, an `inject` that runs in the browser, or a `@code { @client }`
 * with a body.
 *
 * **A `provide` is not in that list, and its absence is the whole of SDD-38 §4.9.** A
 * component may declare providers and stay N1: it hydrates never, downloads no chunk and
 * runs not a line in the browser, and its provider still reaches the page — through the
 * route's IoC module, which is not its chunk. Only `inject` promotes, and only in the zones
 * that run in a browser: an `inject` written in `@server` is a line the client never sees.
 */
export function isIntrinsicallyHydratable(comp: ResolvedComponent): boolean {
  const code = codeOf(comp);
  return (
    code.signals.length > 0 ||
    code.client.body.length > 0 ||
    code.di.some((d) => d.kind === 'inject' && d.zone !== 'server') ||
    hasHookup(comp)
  );
}

/**
 * Every `ElementNode` of a template, saying of each whether it sits INSIDE a construct.
 *
 * That second fact is what tells a host the server will paint exactly once from one the
 * browser may have to create: a branch of an `@if` and a body of a `@foreach` are re-run
 * when what they read moves, and every host in them is fabricated afresh.
 */
function walkElementsInBlocks(
  nodes: readonly HtmlContent[],
  inBlock: boolean,
  visit: (el: ElementNode, inBlock: boolean) => void,
): void {
  for (const node of nodes) {
    switch (node.type) {
      case 'element': {
        const el = node as ElementNode;
        visit(el, inBlock);
        walkElementsInBlocks(el.children, inBlock, visit);
        break;
      }
      case 'if':
      case 'switch':
      case 'foreach':
      case 'for':
      case 'while':
        for (const branch of branchesOf(node as unknown as ControlNode)) {
          walkElementsInBlocks(branch.body, true, visit);
        }
        break;
      default:
        break;
    }
  }
}

/**
 * The tags of the graph marked `formassociated` (decision 111) — the control-components.
 *
 * They are the ONE exception to gesture-driven hydration (SDD-17): their JavaScript is
 * downloaded and run when the runtime installs, before anything is touched. A form-associated
 * component half-raised — defined but stateless, or not defined at all — is not labelable,
 * contributes nothing to a `FormData` and has no validity, and that is worse than a few
 * kilobytes. The list is bounded by the marker and by nothing else, which is what keeps the
 * exception an exception (SDD-34 §4.5, §6.16).
 */
export function formAssociatedTags(graph: ComponentGraph): ReadonlySet<string> {
  const marked = new Set<string>();
  for (const comp of allComponents(graph)) {
    const template = comp.doc.template;
    if (template !== undefined && isFormAssociated(template)) marked.add(comp.tag);
  }
  return marked;
}

/** The component hosts of a run of markup, as `(host element, child tag)`. */
function componentHosts(
  graph: ComponentGraph,
  roots: readonly HtmlContent[],
  visit: (el: ElementNode, child: ResolvedComponent, inBlock: boolean) => void,
): void {
  walkElementsInBlocks(roots, false, (el, inBlock) => {
    const child = componentOf(graph, el.name);
    if (child !== undefined) visit(el, child, inBlock);
  });
}

/**
 * One pass of the induced rule over the markup of ONE owner, whoever the owner is.
 *
 * It is written against `(source, roots, code, moving)` and not against a component, because
 * since SDD-39 a ROUTE owns markup too and the rule about it is word for word the same: a
 * host it hands a value that can move hydrates, and so does one it renders inside a
 * construct, which the browser may fabricate. Returns whether it added anything, which is
 * what the fixpoint above it turns on.
 */
function induceFrom(
  graph: ComponentGraph,
  source: string,
  roots: readonly HtmlContent[],
  code: ExtractedCode,
  moving: ReadonlySet<string>,
  hydratable: Set<string>,
): boolean {
  let changed = false;
  componentHosts(graph, roots, (el, child, inBlock) => {
    if (hydratable.has(child.tag)) return;
    // A host inside a construct of an owner that hydrates is a host the BROWSER may create:
    // the construct re-runs, and every instance it makes then is one no server painted. Its
    // owner raises it, and it can only be raised if it has a chunk to be defined from — so it
    // hydrates, whatever it says about itself. The overapproximation goes in the direction
    // this file already argues for: a chunk downloaded for an instance that never appeared
    // costs a request during an interaction; the instance appearing with no chunk is an empty
    // element and no diagnostic can catch it.
    if (inBlock) {
      hydratable.add(child.tag);
      changed = true;
      return;
    }
    for (const attr of el.attributes) {
      const b = classifyAttribute(attr, source).value;
      if (b.type !== 'property') continue;
      if (!readsMoving(b.value, code.template.ast, moving)) continue;
      hydratable.add(child.tag);
      changed = true;
      return;
    }
  });
  return changed;
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
 * deterministic: the iteration order is `allComponents`, which already is.
 *
 * `allComponents` and not `graph.components`, and that is not a detail: the entry of a graph
 * is not in that map, so a component compiled ON ITS OWN — which is exactly how the Vite
 * plugin compiles every `.fud` — would be missing from its own answer, and would then fail
 * to claim the children it renders. The same file has to emit the same text however it was
 * reached.
 */
export function hydratableTags(graph: ComponentGraph): ReadonlySet<string> {
  const components = allComponents(graph);
  const hydratable = new Set<string>();
  for (const comp of components) {
    if (isIntrinsicallyHydratable(comp)) hydratable.add(comp.tag);
  }

  // And the ENTRY, when it is a route with a client half of its own (SDD-39 §4.5). It seeds
  // the induced rule exactly as a hydratable component does: a route that hands a signal to a
  // component makes that component reactive, or the child would be handed a cell nobody could
  // give it. It is not in `components` — it has no tag — so it is asked separately. A route
  // with no client half seeds nothing: composing islands is not being one (§4.5).
  const entry = isReactiveRoute(graph) ? entryHalf(graph) : undefined;

  let changed = true;
  while (changed) {
    changed = false;
    for (const comp of components) {
      if (!hydratable.has(comp.tag)) continue;
      if (induceFrom(graph, comp.source, templateOf(comp), codeOf(comp), movingNames(comp), hydratable)) {
        changed = true;
      }
    }
    if (
      entry !== undefined &&
      induceFrom(graph, graph.entrySource, entry.roots, entry.code, entryMoving(entry.code), hydratable)
    ) {
      changed = true;
    }
  }
  return hydratable;
}

/**
 * The names a ROUTE can see move. The same three sources as a component's, minus the one it
 * does not have: nobody hands a route props.
 */
export function entryMoving(code: ExtractedCode): ReadonlySet<string> {
  return new Set<string>([...code.signals.map((s) => s.name), ...code.mutable]);
}

/**
 * Whether a route has a client half at all — the ONE predicate the build asks (SDD-39 §3.1).
 *
 * Word for word the component rule of `isIntrinsicallyHydratable`, over the markup a route
 * owns instead of a template: a reactive declared in its `@code`, a `@code { @client }` with
 * a body, or a binding that is hookup — an `@evento`, a `bus:`, a `control`.
 *
 * **Composing islands is not being one.** A route that renders three reactive components and
 * declares nothing of its own stays at zero JavaScript: what hydrates there are the
 * components, each on its own gesture, and the page publishes no `fud-route` block.
 *
 * The same overapproximation `isIntrinsicallyHydratable` takes, and for the same reason:
 * hydrating one route too many costs a chunk that was going to be asked for anyway, and
 * hydrating one too few is a page that does not respond — with no diagnostic possible.
 */
export function isReactiveRoute(graph: ComponentGraph): boolean {
  const entry = entryHalf(graph);
  if (entry === undefined) return false;
  return (
    entry.code.signals.length > 0 ||
    entry.code.client.body.length > 0 ||
    hasHookupIn(graph.entrySource, entry.roots)
  );
}

/**
 * How a route comes up: on a gesture, or at install (SDD-39 §4.6).
 *
 * Two exceptions to the gesture, and both already existed. A `control` comes up at install
 * because a form-associated element half-raised is not labelable, adds nothing to a
 * `FormData` and has no validity (SDD-34 §4.5). An `effect` comes up at install because an
 * effect is by definition what happens without anybody touching anything, so an effect that
 * waits for a gesture is not an effect — a clock that only starts when you click it is not
 * running late, it is not a clock.
 */
export function routeHydration(graph: ComponentGraph): 'gesture' | 'eager' {
  const entry = entryHalf(graph);
  if (entry === undefined) return 'gesture';
  const eager = entry.code.clientEffects || hasControlIn(graph.entrySource, entry.roots);
  return eager ? 'eager' : 'gesture';
}

/**
 * The names whose value a component can see MOVE — the one set that decides both who
 * hydrates and who gets handed a value again.
 *
 * Three sources, and the second is the one that used to be missing. Its signals and derived
 * values, obviously. Its **props**, because a prop is not a constant: it is reassigned by
 * `u`, and a component two levels down a drilling chain holds the root's signal as a prop
 * and nothing else. And the `@client` bindings it reassigns itself.
 *
 * **Per FILE, not per graph, and that is a requirement rather than a simplification.** The
 * Vite plugin compiles every `.fud` on its own, so a rule that asked "did anyone in the
 * graph pass this prop something reactive?" would answer differently depending on how the
 * file was reached, and the same source would emit two different chunks. Every prop counts,
 * which is an OVERAPPROXIMATION in the direction this file already argues for: handing a
 * value over once too often costs a comparison the child's `$w` absorbs, and handing it over
 * once too few is a view that stops moving with no diagnostic possible.
 */
export function movingNames(comp: ResolvedComponent): ReadonlySet<string> {
  const code = codeOf(comp);
  return new Set<string>([
    ...code.signals.map((s) => s.name),
    ...code.props.map((p) => p.name),
    ...code.mutable,
  ]);
}
