/**
 * The `control` bindings of ONE template, and the `error` markers that speak for them, resolved
 * once and consumed by BOTH branches (SDD-34 §4.2, §4.3; BUG-41 §4.3).
 *
 * It exists for the same reason `attrs.ts` exists: the server paints the markup and the client
 * adopts it, so the two must agree byte for byte about what an element becomes. Here that is
 * about the ATTRIBUTES the compiler adds — the marker's `id`, the `aria-describedby` that points
 * at it, a summary's `aria-live` — and about the text the server writes into the marker.
 *
 * **The compiler invents no element** (BUG-41 §5). Until BUG-41 it wrote a `<span>` of its own
 * after every bound element, in a place and with a tag the author could not choose. Now the
 * element that carries a message is the author's, written with `error="@node"` wherever the
 * layout wants it; without one there is simply no message element, and `aria-invalid` on the
 * bound element is what remains.
 *
 * Three facts cannot be decided element by element, which is why this is a PLAN over the whole
 * template rather than a function called at each node:
 *
 * - **A radio group is N elements and one node** (decision 110). One `bindRadio` call carries
 *   the list, and every radio of the group points at the same marker.
 * - **The marker's id has to be the same on both branches.** When the author wrote none it is
 *   derived from the node's own path, not from a counter — a counter would depend on the two
 *   walks visiting in exactly the same order.
 * - **Which element a marker describes is decided by `pairMarkers`**, the same function the
 *   semantic pass reports with, so a pair the analyzer accepted is exactly a pair emitted.
 */

import type { ElementNode, HtmlContent } from '../html/index.js';
import {
  classifyAttribute,
  controlTarget,
  isRadio,
  pairMarkers,
  type ControlTarget,
  type MarkerKind,
} from '../binding/index.js';
import { walkElements } from './level.js';

/** What one element with a `control` binding turns into, on both branches. */
export interface ControlSite {
  /** What the element makes of the binding (decision 109). */
  readonly target: ControlTarget;
  /** The form node, sliced from the source: `f.seo.canonical`. */
  readonly node: string;
  /** The author's marker for this node in the same block, or `null` when they wrote none. */
  readonly marker: ElementNode | null;
  /** The id `aria-describedby` points at — the marker's — or `''` without a marker. */
  readonly describedBy: string;
  /**
   * The `@fudic/forms/dom` function THIS element calls, or `null` when it calls none.
   *
   * The name and the «does it call?» are one field and not two, and that is what keeps the
   * emitter from carrying a branch it can never take: a component tag crosses a reference
   * instead of calling (decision 112), and every radio but the last defers to the one that
   * carries the group.
   */
  readonly bind: string | null;
  /** The whole radio group, in document order, on the element that emits its call. */
  readonly group: readonly ElementNode[];
}

/** What one `error` marker turns into, on both branches. */
export interface MarkerSite {
  /** The node it speaks for, sliced from the source. */
  readonly node: string;
  /** A value's error, or a form's or a group's summary. */
  readonly kind: MarkerKind;
  /** The id the bound element points at. */
  readonly id: string;
  /** Whether the compiler writes that id — false when the author wrote their own. */
  readonly writesId: boolean;
  /** Whether the compiler adds `aria-live="polite"`: a form's summary whose author wrote none. */
  readonly live: boolean;
  /**
   * The expression of the text the SERVER writes into it: the error of a touched control, or
   * the summary of a form or a group. The client writes nothing — its effect does, afterwards.
   */
  readonly text: string;
}

/** Every `control` and every `error` marker of a template, keyed by the element. */
export interface ControlPlan {
  readonly sites: ReadonlyMap<ElementNode, ControlSite>;
  readonly markers: ReadonlyMap<ElementNode, MarkerSite>;
}

/** A template with no form in it. */
export const EMPTY_CONTROLS: ControlPlan = { sites: new Map(), markers: new Map() };

/**
 * The id a marker gets when the author wrote none, derived from the form node's own path.
 *
 * **Derived and not counted**, because the two branches have to agree and a counter agrees
 * only as long as they walk in exactly the same order. The path is unique within the component
 * — one marker per node, `FUD0598` — so the id is too.
 *
 * Every character that is not a letter, a digit or an underscore becomes one dash — one for
 * one, never collapsed — so `f.title` and `f['title']` do not land on the same id.
 */
export function slotIdOf(prefix: string, node: string): string {
  return prefix + node.replace(/[^A-Za-z0-9_]/gu, '-');
}

/** One element as the first pass sees it, before the radio groups are folded. */
interface Found {
  readonly el: ElementNode;
  readonly target: ControlTarget;
  readonly node: string;
}

/**
 * Resolve the `control` bindings and the `error` markers of a template.
 *
 * `isComponent` is injected for the same reason `controlTarget` takes it: who is a declared
 * component tag is graph knowledge, and this module holds no graph.
 *
 * An element the compiler cannot bind — `FUD0592`'s three faces — is simply absent from the
 * plan, and so is a marker `pairMarkers` rejected. Both were already reported by the semantic
 * pass, and the emit does not stop for them: it omits THAT binding and goes on.
 */
export function planControls(
  source: string,
  roots: readonly HtmlContent[],
  isComponent: (tag: string) => boolean,
): ControlPlan {
  const found: Found[] = [];
  walkElements(roots, (el) => {
    for (const attr of el.attributes) {
      const binding = classifyAttribute(attr, source).value;
      if (binding.type !== 'control') continue;
      const target = controlTarget(el, isComponent(el.name));
      if (target.kind === 'unsupported') continue;
      found.push({ el, target, node: source.slice(binding.value.expr.start, binding.value.expr.end) });
    }
  });

  const pairing = pairMarkers(source, roots, isComponent);
  const markers = new Map<ElementNode, MarkerSite>();
  for (const [el, marker] of pairing.markers) {
    const form = marker.kind !== 'value';
    markers.set(el, {
      node: marker.node,
      kind: marker.kind,
      id: marker.id ?? slotIdOf(form ? 'fud-s-' : 'fud-e-', marker.node),
      writesId: marker.id === null,
      live: marker.kind === 'form' && !hasAttribute(el, 'aria-live'),
      // Touched, exactly as the client's effect asks: an untouched field is unfilled, not
      // wrong, and the two branches cannot disagree about that or the hydration would repaint.
      text: form ? `${marker.node}.$message()` : `(${marker.node}.touched() ? ${marker.node}.message() : '')`,
    });
  }

  // Radios first: the group decides who emits the call, and that is about the group rather
  // than about any one element in it.
  const radios = new Map<string, ElementNode[]>();
  for (const one of found) {
    if (!isRadio(one.el)) continue;
    const group = radios.get(one.node) ?? [];
    group.push(one.el);
    radios.set(one.node, group);
  }

  const sites = new Map<ElementNode, ControlSite>();
  for (const one of found) {
    const group = radios.get(one.node) ?? [];
    const last = group.length === 0 || group[group.length - 1] === one.el;
    const marker = pairing.describedBy.get(one.el) ?? null;
    sites.set(one.el, {
      target: one.target,
      node: one.node,
      marker,
      describedBy: marker === null ? '' : markers.get(marker)!.id,
      // One call for the group, from its LAST element. Not the first, and that is a fact about
      // the client walk rather than a preference: the call names every radio's node variable,
      // and those variables only exist once the walk has been through them.
      bind: last ? bindOf(one.target) : null,
      group: group.length > 0 && last ? group : [],
    });
  }
  return { sites, markers };
}

function hasAttribute(el: ElementNode, name: string): boolean {
  return el.attributes.some((a) => typeof a.name === 'string' && a.name.toLowerCase() === name);
}

/**
 * The `@fudic/forms/dom` function a target calls, or `null` for one that calls none.
 *
 * A component tag is the `null`: what crosses there is the REFERENCE, as a prop
 * (decision 112), and the child binds it to its own `<input>` with these same rules. An
 * unsupported element never reaches here — it is not in the plan at all.
 */
function bindOf(target: ControlTarget): string | null {
  if (target.kind === 'value') return target.bind;
  if (target.kind === 'form') return 'bindForm';
  return target.kind === 'group' ? 'bindGroup' : null;
}
