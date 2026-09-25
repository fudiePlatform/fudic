/**
 * The `control` bindings of ONE template, and the `error` / `summary` markers that speak for
 * them, resolved once and consumed by BOTH branches (SDD-34 §4.2, §4.3; BUG-41 §4.3; BUG-42 §4.2).
 *
 * It exists for the same reason `attrs.ts` exists: the server paints the markup and the client
 * adopts it, so the two must agree byte for byte about what an element becomes. Here that is
 * about the ATTRIBUTES the compiler adds — the marker's `id`, the `aria-describedby` that points
 * at it, a summary's `aria-live` and `tabindex`, the id of a field a summary links to, the id of
 * a control-component's field — and about what the server writes into a marker.
 *
 * **The compiler invents no element** (BUG-41 §5). The element that carries a message is the
 * author's, written with `error="@node"` or `summary="@node"` wherever the layout wants it; the
 * compiler only adds attributes to elements the author wrote.
 *
 * Facts that cannot be decided element by element, which is why this is a PLAN over the whole
 * template rather than a function called at each node:
 *
 * - **A radio group is N elements and one node** (decision 110). One `bindRadio` call carries
 *   the list, and every radio of the group points at the same marker.
 * - **Every id the compiler writes has to be the same on both branches.** When the author wrote
 *   none it is derived from the node's own path, not from a counter — a counter would depend on
 *   the two walks visiting in exactly the same order.
 * - **Which element a marker describes is decided by `pairMarkers`**, the same function the
 *   semantic pass reports with, so a pair the analyzer accepted is exactly a pair emitted.
 * - **A summary with `fields` links to fields anywhere in the template**, and each of those
 *   without a marker of its own is described by its entry of the summary.
 */

import type { ElementNode, HtmlContent } from '../html/index.js';
import {
  bridgeOf,
  classifyAttribute,
  controlTarget,
  isRadio,
  pairMarkers,
  staticId,
  type ControlTarget,
  type MarkerKind,
  type MarkerName,
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
  /**
   * What `aria-describedby` points at — its marker, and the entries of the summaries with
   * `fields` that list it when it has no marker of its own — or `''` for nothing.
   */
  readonly describedBy: string;
  /**
   * Whether the compiler adds `novalidate`: a bound `<form>` whose author wrote none.
   *
   * `bindForm` validates on submit, and the browser's own constraint validation runs BEFORE the
   * submit event: left on, a field whose error is already known stops the submit with a native
   * bubble, and the form's validation never runs. One validator per form, the one the author
   * configured.
   */
  readonly noValidate: boolean;
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

/** What one marker turns into, on both branches. */
export interface MarkerSite {
  /** The node it speaks for, sliced from the source. */
  readonly node: string;
  /** A value's error, a crossing's error, or a form's or a group's summary. */
  readonly kind: MarkerKind;
  /** Which attribute made it a marker. */
  readonly attr: MarkerName;
  /** The id the bound element points at. */
  readonly id: string;
  /** Whether the compiler writes that id — false when the author wrote their own. */
  readonly writesId: boolean;
  /** Whether the compiler adds `aria-live="polite"`: a summary whose author wrote none. */
  readonly live: boolean;
  /**
   * The map path → id of the fields a summary with `fields` links to, or `null` for any other
   * marker. It is also what makes the compiler add `tabindex="-1"`: a failed submit sends the
   * focus to that summary.
   */
  readonly links: Readonly<Record<string, string>> | null;
  /**
   * The expression of the text the SERVER writes into an `error` marker: the error of a touched
   * control. `''` for a summary, whose list the server builds from `summaryEntriesOf`.
   */
  readonly text: string;
  /**
   * The call the marker makes by itself: `bindMessage` for the marker of a control that crosses
   * into a control-component, whose input the child binds (BUG-42 §4.9). `null` for any other.
   */
  readonly bind: 'bindMessage' | null;
}

/** Every `control` and every marker of a template, keyed by the element. */
export interface ControlPlan {
  readonly sites: ReadonlyMap<ElementNode, ControlSite>;
  readonly markers: ReadonlyMap<ElementNode, MarkerSite>;
  /**
   * The ids the compiler writes on elements of the author's that have none: a field a summary
   * links to (`fud-c-…`), and the field of a control-component (`fud-field`, decision 132).
   */
  readonly ids: ReadonlyMap<ElementNode, string>;
  /** The id of this template's field when it is a control-component, or `null`. */
  readonly field: string | null;
}

/** A template with no form in it. */
export const EMPTY_CONTROLS: ControlPlan = { sites: new Map(), markers: new Map(), ids: new Map(), field: null };

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

/**
 * The id of a field's entry in a summary, as `@fudic/forms` derives it (`issueId`): the summary's
 * id and the path, with the dots of a nested path turned into dashes. The two sides of one
 * reference, so the rule is written in the same words on both.
 */
export function issueIdOf(summary: string, path: string): string {
  return `${summary}-${path.replaceAll('.', '-')}`;
}

/** What the plan needs to know besides the markup. */
export interface PlanContext {
  /** Whether a tag is a declared component — graph knowledge, injected. */
  readonly isComponent: (tag: string) => boolean;
  /** Whether a component tag is a control-component. */
  readonly isFormAssociated: (tag: string) => boolean;
  /** The root `<template>` of the component, for its bridge; absent for a page. */
  readonly template?: ElementNode;
}

/** One element as the first pass sees it, before the radio groups are folded. */
interface Found {
  readonly el: ElementNode;
  readonly target: ControlTarget;
  readonly node: string;
}

/**
 * Resolve the `control` bindings and the markers of a template.
 *
 * An element the compiler cannot bind — `FUD0592`'s three faces — is simply absent from the
 * plan, and so is a marker `pairMarkers` rejected. Both were already reported by the semantic
 * pass, and the emit does not stop for them: it omits THAT binding and goes on.
 */
export function planControls(
  source: string,
  roots: readonly HtmlContent[],
  ctx: PlanContext,
): ControlPlan {
  const found: Found[] = [];
  walkElements(roots, (el) => {
    for (const attr of el.attributes) {
      const binding = classifyAttribute(attr, source).value;
      if (binding.type !== 'control') continue;
      const target = controlTarget(el, ctx.isComponent(el.name));
      if (target.kind === 'unsupported') continue;
      found.push({ el, target, node: source.slice(binding.value.expr.start, binding.value.expr.end) });
    }
  });

  const ids = new Map<ElementNode, string>();
  const bridge = ctx.template === undefined ? null : bridgeOf(ctx.template, source).bridge;
  if (bridge?.field != null && bridge.writesId) ids.set(bridge.field, bridge.id);

  const pairing = pairMarkers(source, roots, ctx.isComponent, ctx.isFormAssociated);
  const markers = new Map<ElementNode, MarkerSite>();
  /** The summary entries that describe each bound element with no marker of its own. */
  const entries = new Map<ElementNode, string[]>();
  for (const [el, marker] of pairing.markers) {
    const summary = marker.attr === 'summary';
    const id = marker.id ?? slotIdOf(summary ? 'fud-s-' : 'fud-e-', marker.node);
    let links: Record<string, string> | null = null;
    if (marker.fields) {
      links = {};
      const prefix = `${marker.node.trim()}.`;
      for (const one of found) {
        const node = one.node.trim();
        if (!node.startsWith(prefix)) continue;
        const path = node.slice(prefix.length);
        if (path in links) continue; // the first radio of a group is where its link lands
        const own = staticId(one.el);
        if (own === undefined) continue; // a dynamic id cannot be linked to
        const target = own ?? ids.get(one.el) ?? slotIdOf('fud-c-', node);
        if (own === null) ids.set(one.el, target);
        links[path] = target;
        if (!pairing.describedBy.has(one.el)) {
          const list = entries.get(one.el) ?? [];
          list.push(issueIdOf(id, path));
          entries.set(one.el, list);
        }
      }
    }
    markers.set(el, {
      node: marker.node,
      kind: marker.kind,
      attr: marker.attr,
      id,
      writesId: marker.id === null,
      live: summary && !hasAttribute(el, 'aria-live'),
      links,
      // Touched, exactly as the client's effect asks: an untouched field is unfilled, not
      // wrong, and the two branches cannot disagree about that or the hydration would repaint.
      text: summary ? '' : `(${marker.node}.touched() ? ${marker.node}.message() : '')`,
      bind: marker.kind === 'crossing' ? 'bindMessage' : null,
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
    const describedBy = marker === null ? (entries.get(one.el) ?? []) : [markers.get(marker)!.id];
    sites.set(one.el, {
      target: one.target,
      node: one.node,
      marker,
      describedBy: describedBy.join(' '),
      noValidate: one.target.kind === 'form' && !hasAttribute(one.el, 'novalidate'),
      // One call for the group, from its LAST element. Not the first, and that is a fact about
      // the client walk rather than a preference: the call names every radio's node variable,
      // and those variables only exist once the walk has been through them.
      bind: last ? bindOf(one.target) : null,
      group: group.length > 0 && last ? group : [],
    });
  }
  return { sites, markers, ids, field: bridge?.id ?? null };
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
