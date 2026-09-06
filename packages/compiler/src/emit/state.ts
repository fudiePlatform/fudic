/**
 * The CELLS a component publishes: the names of its `@code { @client }` that some child asked
 * to be handed by reference, and the slot each of them occupies in its payload slice
 * (BUG-24 §4.2).
 *
 * It is deliberately the ONLY source of those indices. Three emitters need them and they need
 * the same ones: the client chunk, which destructures its slice positionally; the server
 * module, which serialises the owner's slice; and the marker the child carries, which is that
 * address written down. A second computation of the same order — even a correct one — is a
 * payload that stops lining up the day one of the three grows a case the others do not.
 *
 *     slice of the owner = [ ...props, ...cells ]
 *
 * Behind the props and never among them, so no index that exists today moves: a page with no
 * cell serialises exactly the bytes it serialised before.
 */

import { classifyAttribute, crossing } from '../binding/index.js';
import { propTarget, type PropTarget } from './attrs.js';
import { codeOf } from './oxc-code.js';
import { declaredProps } from './registry.js';
import { componentOf, type ComponentGraph, type ResolvedComponent } from './resolve.js';
import { templateOf, walkElements } from './level.js';

/**
 * What each child tag of a graph declares, as the two emit branches ask it.
 *
 * One function for both, because the server and the client have to reach the same verdict
 * about the same prop: the server hands the child an object and the client hands it a cell,
 * and those are two halves of one decision, not two decisions.
 */
export function childTargets(graph: ComponentGraph): (tag: string) => PropTarget | undefined {
  return (tag) => {
    const child = componentOf(graph, tag);
    return child === undefined ? undefined : propTarget(declaredProps(child));
  };
}

/**
 * The names a component reads as REACTIVES: the ones it declares with `signal(…)`/`computed(…)`
 * and the props it was handed as cells.
 *
 * The second half is the unification of §4.5: a prop that arrived by reference is a signal
 * like any other, so it inherits the whole existing rule set — the read `value()` where the
 * template crosses it on to a grandchild, and the subscription that repaints this component —
 * with no new rule anywhere.
 */
export function reactiveScope(comp: ResolvedComponent): ReadonlySet<string> {
  const code = codeOf(comp);
  return new Set([
    ...code.signals.map((s) => s.name),
    ...code.props.flatMap((p) => (p.channel === 'signal' ? [p.name] : [])),
  ]);
}

/** One cell of a component: the name that owns it, where it sits, and what it holds. */
export interface CellSlot {
  /** The `@client` name — a `signal`/`computed`, or a function — that occupies the slot. */
  readonly name: string;
  /**
   * Its index in the owner's slice, counting the props: `[...props, ...cells]`. It is the
   * `slot` of a `CellRef`, so it is what `data[offsets[owner] + slot]` reads.
   */
  readonly slot: number;
  readonly kind: 'signal' | 'fn';
}

/**
 * The cells `comp` publishes, in the order its `@client` declares them.
 *
 * Only names `@client` itself declares. A prop this component merely FORWARDS to a grandchild
 * is a cell of whoever declared it — the marker the grandchild carries points at that owner,
 * not at this instance — and giving it a slot here would be minting a second address for one
 * object, which is the exact bug the cell exists to prevent.
 */
export function cellSlots(comp: ResolvedComponent, graph: ComponentGraph): readonly CellSlot[] {
  const code = codeOf(comp);
  const declared = new Set(code.clientNames);
  if (declared.size === 0) return [];

  const signals = new Set(code.signals.map((s) => s.name));
  const crossed = new Set<string>();
  walkElements(templateOf(comp), (el) => {
    const child = componentOf(graph, el.name);
    if (child === undefined) return;
    const props = declaredProps(child);
    for (const attr of el.attributes) {
      const b = classifyAttribute(attr, comp.source).value;
      if (b.type !== 'property') continue;
      const target = props.find((p) => p.name === b.name);
      const how = crossing(comp.source, b.value, signals, target);
      if (how?.kind === 'ref' && declared.has(how.name)) crossed.add(how.name);
    }
  });
  if (crossed.size === 0) return [];

  // A cell whose name is not a reactive declaration is a FUNCTION: that is the whole of the
  // distinction, and it is only ever two things — what serialises as a value, and what has no
  // value to serialise (§4.6).
  const props = code.props.length;
  return code.clientNames
    .filter((name) => crossed.has(name))
    .map((name, i) => ({
      name,
      slot: props + i,
      kind: signals.has(name) ? ('signal' as const) : ('fn' as const),
    }));
}
