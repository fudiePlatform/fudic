/**
 * The `control` bindings of ONE template, resolved once and consumed by BOTH branches
 * (SDD-34 §4.2, §4.3).
 *
 * It exists for the same reason `attrs.ts` exists: the server paints the markup and the client
 * adopts it, so the two must agree byte for byte about what an element becomes. Here that is
 * sharper than usual, because the emit does not only write attributes — it writes an extra
 * NODE, the error slot, as a sibling of the element. A slot the server painted and the client
 * did not fabricate is one node of difference between the two trees, and a hydration that
 * adopts nothing.
 *
 * Three facts cannot be decided element by element, which is why this is a PLAN over the whole
 * template rather than a function called at each node:
 *
 * - **A radio group is N elements and one node** (decision 108). One `bindRadio` call carries
 *   the list, and there is ONE error slot for the group, not one per radio — N slots would be
 *   N elements carrying the same id.
 * - **The slot's id has to be the same on both branches.** It is derived from the form node's
 *   own path, not from a counter: a counter would depend on the two walks visiting in exactly
 *   the same order, and the path is unique inside the component by `FUD0591` — which is also
 *   what makes the radio group share one id for free.
 * - **What gets a slot at all depends on the kind of binding.** A control does; a `<form>` gets
 *   a live region instead; a group and a component tag get neither.
 */

import type { ElementNode, HtmlContent } from '../html/index.js';
import { classifyAttribute, controlTarget, isRadio, type ControlTarget } from '../binding/index.js';
import { walkElements } from './level.js';

/** What one element with a `control` binding turns into, on both branches. */
export interface ControlSite {
  /** What the element makes of the binding (decision 107). */
  readonly target: ControlTarget;
  /** The form node, sliced from the source: `f.seo.canonical`. */
  readonly node: string;
  /**
   * The id of the element the emit writes beside this one — the error slot of a control, the
   * live region of a `<form>` — or `''` when this binding gets neither.
   */
  readonly slotId: string;
  /** Whether that element is written right after THIS one. False for every radio but the last. */
  readonly writesSlot: boolean;
  /**
   * The `@fudic/forms/dom` function THIS element calls, or `null` when it calls none.
   *
   * The name and the «does it call?» are one field and not two, and that is what keeps the
   * emitter from carrying a branch it can never take: a component tag crosses a reference
   * instead of calling (decision 110), and every radio but the last defers to the one that
   * carries the group.
   */
  readonly bind: string | null;
  /** The whole radio group, in document order, on the element that emits its call. */
  readonly group: readonly ElementNode[];
}

/** Every element of a template that carries a usable `control`, keyed by the element. */
export type ControlPlan = ReadonlyMap<ElementNode, ControlSite>;

/** The attribute the error slot is marked with — the compiler's namespace (SDD-15 §3.1). */
export const ERROR_SLOT_ATTR = 'data-fud-err';

/** The attribute the form's live region is marked with. */
export const SUMMARY_SLOT_ATTR = 'data-fud-sum';

/**
 * The id of the element written beside a binding, derived from the form node's own path.
 *
 * **Derived and not counted**, because the two branches have to agree and a counter agrees
 * only as long as they walk in exactly the same order — a coupling nothing would enforce and a
 * failure that shows up as a form whose error announces the wrong field. The path is unique
 * within the component by `FUD0591`, so the id is too; and a radio group shares one path, so it
 * shares one slot, which is exactly right.
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
 * Resolve the `control` bindings of a template.
 *
 * `isComponent` is injected for the same reason `controlTarget` takes it: who is a declared
 * component tag is graph knowledge, and this module holds no graph.
 *
 * An element the compiler cannot bind — `FUD0592`'s three faces — is simply absent from the
 * plan. It was already reported by the semantic pass, and the emit does not stop for it: it
 * omits THAT binding and goes on emitting the file.
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

  // Radios first: the group decides who emits the call and who carries the slot, and both
  // answers are about the group rather than about any one element in it.
  const radios = new Map<string, ElementNode[]>();
  for (const one of found) {
    if (!isRadio(one.el)) continue;
    const group = radios.get(one.node) ?? [];
    group.push(one.el);
    radios.set(one.node, group);
  }

  const plan = new Map<ElementNode, ControlSite>();
  for (const one of found) {
    const group = radios.get(one.node) ?? [];
    const inGroup = group.length > 0;
    plan.set(one.el, {
      target: one.target,
      node: one.node,
      slotId: slotIdFor(one),
      // One slot for the group, after its LAST element: the error of a radio group belongs
      // under the choice, not in the middle of it.
      writesSlot: hasSlot(one.target) && (!inGroup || group[group.length - 1] === one.el),
      // One call for the group, from its LAST element — the same one that carries the slot.
      // Not the first, and that is a fact about the client walk rather than a preference: the
      // call names every radio's node variable, and those variables only exist once the walk
      // has been through them.
      bind: !inGroup || group[group.length - 1] === one.el ? bindOf(one.target) : null,
      group: inGroup && group[group.length - 1] === one.el ? group : [],
    });
  }
  return plan;
}

/** Whether an element gets a sibling written beside it, and under which prefix. */
function slotIdFor(one: Found): string {
  if (one.target.kind === 'value') return slotIdOf('fud-e-', one.node);
  if (one.target.kind === 'form') return slotIdOf('fud-s-', one.node);
  // A group marks itself, and a component tag owns its own slot inside its shadow root.
  return '';
}

function hasSlot(target: ControlTarget): boolean {
  return target.kind === 'value' || target.kind === 'form';
}

/**
 * The `@fudic/forms/dom` function a target calls, or `null` for one that calls none.
 *
 * A component tag is the `null`: what crosses there is the REFERENCE, as a prop
 * (decision 110), and the child binds it to its own `<input>` with these same rules. An
 * unsupported element never reaches here — it is not in the plan at all.
 */
function bindOf(target: ControlTarget): string | null {
  if (target.kind === 'value') return target.bind;
  if (target.kind === 'form') return 'bindForm';
  return target.kind === 'group' ? 'bindGroup' : null;
}
