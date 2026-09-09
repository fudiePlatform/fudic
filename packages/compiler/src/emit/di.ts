/**
 * The IoC module of a component (SDD-38 §4.5) — where a provider goes when its owner may
 * never run.
 *
 * **The factory cannot live inside the component that declares it.** Writing a provider does
 * not promote anything: a component may declare `provide(Cart, …)`, inject nothing, stay N1
 * and never download a chunk. Its element is in the DOM and its container is in the published
 * map, but there is no code of its own in the browser to put the factory in. So the factory
 * lives beside it, in a module of its own, fetched only when the page publishes a map that
 * names this tag.
 *
 * Per COMPONENT and not per route, and that is the one place this file departs from the SDD's
 * sketch. §4.5 draws a route-level module exporting `NODES = [-1, 0, 0, 1]`, and those numbers
 * cannot be there: a node is per INSTANCE — a `@foreach` decides how many owners a page has —
 * so they only exist while rendering, and they travel in the published block, not in a module
 * built beforehand. Per component the imports also stay correct with no rebasing, since the
 * statements are copied verbatim from a file that sits where its own imports are relative to.
 * And the pruning comes out sharper than the route-level unit asked for: only the tags that
 * actually own a container on THIS page are fetched.
 */

import { CodeWriter } from './writer.js';
import { codeOf } from './oxc-code.js';
import { allComponents, type ComponentGraph, type ResolvedComponent } from './resolve.js';

/** The suffix that turns a tag into the name of its IoC module. */
export const IOC_SUFFIX = '.ioc';

/** The chunk name a tag's IoC module is published under — the tag plus one suffix. */
export const iocName = (tag: string): string => `${tag}${IOC_SUFFIX}`;

/** Whether this component writes a DI call at all — of either kind, in any zone. */
export function usesDependencyInjection(comp: ResolvedComponent): boolean {
  return codeOf(comp).di.length > 0;
}

/** Whether this component owns a container: it declares at least one provider, in any zone. */
export function ownsContainer(comp: ResolvedComponent): boolean {
  return codeOf(comp).di.some((d) => d.kind === 'provide');
}

/**
 * Whether ANY component of the graph injects or provides.
 *
 * It is what decides that a page opens a container tree at all. A page without a single DI
 * call carries no root, publishes no map and imports nothing — the base case of the
 * framework, not an exception.
 */
export function hasDependencyInjection(graph: ComponentGraph): boolean {
  return allComponents(graph).some(usesDependencyInjection);
}

/**
 * The IoC module of one component, or `null` when it registers nothing the browser runs.
 *
 * `register(c)` is called once per node the published map attributes to this tag, with the
 * container that node stands for. `$own` is bound to it because that is the name the rewrite
 * already wrote into every `provideIn(…)` of the source (§4.6) — one name, one meaning, on
 * both sides.
 */
export function emitComponentIocModule(comp: ResolvedComponent): string | null {
  const { providers } = codeOf(comp);
  if (providers.body.length === 0) return null;

  const w = new CodeWriter();
  w.line(`import { provideIn } from '@fudic/di';`);
  for (const line of providers.imports) w.line(line);
  w.line('');
  w.line('export function register($own) {');
  w.indent();
  for (const statement of providers.body) w.line(statement.text);
  w.dedent();
  w.line('}');
  return w.toString();
}
