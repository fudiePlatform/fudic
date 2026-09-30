/**
 * The SURFACE of a style scope: everything a selector could match there (SDD-49 §3.3, §4.2).
 *
 * A page's markup is static — every element it can ever hold is in a `.fud` of the graph the
 * emit already resolved, in every branch of every `@if`, `@switch` and loop — and its scopes
 * are closed: a sheet the document links reaches its light DOM and nothing else, and a sheet a
 * component adopts reaches that shadow root and nothing else. So the question «can this rule
 * apply to anything here?» has an answer that is not a guess, and this module collects what it
 * takes to give it.
 *
 * What is collected errs in one direction only. A class interpolated from an expression opens
 * the whole class space (`openClasses`), a value written from an expression opens that
 * attribute's values, and an attribute the framework writes counts as if the author had: the
 * prune may keep a rule nobody needs, and must never drop one somebody does.
 */

import type { ElementNode, HtmlContent } from '../html/index.js';
import type { SectionNode } from '../layout/index.js';
import type { ControlNode } from '../control/index.js';
import { walkElements } from './level.js';
import { branchesOf } from './constructs.js';
import { allComponents, componentOf, type DocumentGraph } from './resolve.js';
import { holeSlot } from './compose.js';
import { SPACE_ATTR } from './space.js';

export interface ScopeSurface {
  readonly tags: ReadonlySet<string>;
  readonly classes: ReadonlySet<string>;
  readonly ids: ReadonlySet<string>;
  /** Name → the literal values seen; `null` when some value is an expression. */
  readonly attributes: ReadonlyMap<string, ReadonlySet<string> | null>;
  /** Some `class` of this scope interpolates an expression. */
  readonly openClasses: boolean;
  /** Some `id` of this scope interpolates an expression. */
  readonly openIds: boolean;
  /** What parents project into the components of this scope: for `::slotted()`. */
  readonly slotted: ScopeSurface | null;
  /** The `part`s the page's components expose: for `::part()`. */
  readonly parts: ReadonlySet<string> | 'any';
}

export type StyleScope = 'document' | 'shadow';

/** The constructs whose branches hold markup — the same set `walkElements` goes through. */
const CONTROL = new Set(['if', 'switch', 'foreach', 'for', 'while']);

/** Form controls: the ones `@fudic/forms` may label or mark invalid at runtime. */
const FIELDS = new Set(['input', 'select', 'textarea', 'fieldset']);

/**
 * The attributes the emit or the runtime write on an element besides the author's (§4.2).
 *
 * The ONE list, and it is read element by element, so each entry is decided from what the
 * element itself says:
 *
 * - `slot`, when the element is a root of markup a slotted hole seals (SDD-48) — a fact of
 *   where it is written, which is why the caller says so with `sealed`;
 * - a `control`: `aria-describedby` towards its marker, and `aria-invalid` / `aria-label`,
 *   which `@fudic/forms` writes at runtime; a bound `<form>` gets `novalidate`;
 * - any form field, `aria-invalid` and `aria-label` as well: a control-component's relay
 *   labels the input of its own template, which carries no `control` of its own;
 * - an `error` or `summary` marker: its `id`, and a summary's `aria-live` and `tabindex`;
 * - a custom element: `data-fud-adopt` and `data-fud-id`, the adoption and hydration markers;
 * - every element: `data-fud-space`, which the whitespace model may write.
 */
export function frameworkAttributesOf(el: ElementNode, sealed = false): readonly string[] {
  const out: string[] = [];
  const named = new Set(
    el.attributes.flatMap((a) => (typeof a.name === 'string' ? [a.name.toLowerCase()] : [])),
  );
  const name = el.name.toLowerCase();
  if (sealed) out.push('slot');
  if (named.has('control')) {
    out.push('aria-describedby', 'aria-invalid', 'aria-label');
    if (name === 'form') out.push('novalidate');
  } else if (FIELDS.has(name)) {
    out.push('aria-invalid', 'aria-label');
  }
  if (named.has('error') || named.has('summary')) out.push('id', 'aria-live', 'tabindex');
  if (name.includes('-')) out.push('data-fud-adopt', 'data-fud-id');
  out.push(SPACE_ATTR);
  return out;
}

/** The literal text of an attribute's value, or `null` when a part of it is an expression. */
function literalValue(attr: ElementNode['attributes'][number]): string | null {
  let out = '';
  for (const part of attr.value) {
    if (part.type !== 'attribute-text') return null;
    out += part.value;
  }
  return out;
}

/** The words of a class list, split at whitespace. */
const words = (text: string): string[] => text.split(/\s+/u).filter((w) => w !== '');

/** A surface being collected. */
class SurfaceBuilder {
  readonly tags = new Set<string>();
  readonly classes = new Set<string>();
  readonly ids = new Set<string>();
  readonly attributes = new Map<string, Set<string> | null>();
  openClasses = false;
  openIds = false;

  #attribute(name: string, value: string | null): void {
    if (!this.attributes.has(name)) this.attributes.set(name, new Set());
    const seen = this.attributes.get(name);
    if (seen === null || seen === undefined) return;
    if (value === null) this.attributes.set(name, null);
    else seen.add(value);
  }

  /** One element as written, plus what the framework adds to it. */
  element(el: ElementNode, sealed = false): void {
    this.tags.add(el.name.toLowerCase());
    for (const attr of el.attributes) {
      if (typeof attr.name !== 'string') continue; // `bus:(expr)`, an event channel
      const raw = attr.name;
      // Events and properties are not attributes: nothing a selector can see.
      if (raw.startsWith('@') || raw.startsWith('.')) continue;
      const name = raw.toLowerCase();
      if (name.startsWith('bus:')) continue;
      if (name.startsWith('class:')) {
        // Named in the code whatever the condition says (decision 22).
        this.classes.add(raw.slice('class:'.length));
        this.#attribute('class', null);
        continue;
      }
      if (name.startsWith('style:')) {
        this.#attribute('style', null);
        continue;
      }
      const value = literalValue(attr);
      if (name === 'class') {
        for (const part of attr.value) {
          if (part.type === 'attribute-text') for (const w of words(part.value)) this.classes.add(w);
          else this.openClasses = true;
        }
      } else if (name === 'id') {
        if (value === null) this.openIds = true;
        else if (value.trim() !== '') this.ids.add(value.trim());
      }
      this.#attribute(name, value);
    }
    for (const name of frameworkAttributesOf(el, sealed)) this.#attribute(name, null);
  }

  /** Every element of a run of markup, in every branch. */
  markup(nodes: readonly HtmlContent[]): void {
    walkElements(nodes, (el) => this.element(el));
  }

  /** The roots of a run a slotted hole seals, which carry its `slot=`. */
  sealed(nodes: readonly HtmlContent[]): void {
    for (const el of rootElements(nodes)) this.element(el, true);
    this.markup(nodes);
  }

  build(slotted: ScopeSurface | null, parts: ReadonlySet<string> | 'any'): ScopeSurface {
    return {
      tags: this.tags,
      classes: this.classes,
      ids: this.ids,
      attributes: this.attributes,
      openClasses: this.openClasses,
      openIds: this.openIds,
      slotted,
      parts,
    };
  }
}

/**
 * The elements at the top of a run, through its constructs: the children of a host that a
 * `<slot>` can project, and the roots a hole seals.
 */
function rootElements(nodes: readonly HtmlContent[]): readonly ElementNode[] {
  const out: ElementNode[] = [];
  for (const node of nodes) {
    if (node.type === 'element') out.push(node as ElementNode);
    else if (CONTROL.has(node.type)) {
      for (const branch of branchesOf(node as unknown as ControlNode)) out.push(...rootElements(branch.body));
    }
  }
  return out;
}

/** Every run of markup of the document scope: the shell, the route and its sections. */
function documentRuns(graph: DocumentGraph): {
  readonly plain: readonly HtmlContent[][];
  readonly sealed: readonly HtmlContent[][];
  readonly shells: readonly ElementNode[];
} {
  const plain: HtmlContent[][] = [];
  const sealed: HtmlContent[][] = [];
  const shells: ElementNode[] = [];
  for (const layout of graph.layouts) {
    shells.push(layout.doc.html, layout.doc.body);
    plain.push([...layout.doc.body.children]);
  }
  const entry = graph.entry;
  if (entry.type === 'page-document' || entry.type === 'layout-document') {
    shells.push(entry.html, entry.body);
    plain.push([...entry.body.children]);
  } else if (entry.type === 'route-document') {
    (holeSlot(graph, { kind: 'body' }) === undefined ? plain : sealed).push([...entry.markup]);
    for (const section of entry.sections as readonly SectionNode[]) {
      const slot = holeSlot(graph, { kind: 'section', name: section.name });
      (slot === undefined ? plain : sealed).push([...section.children]);
    }
  }
  return { plain, sealed, shells };
}

/** Every run of markup in the page, of any scope: the document's and every template. */
function allRuns(graph: DocumentGraph): readonly (readonly HtmlContent[])[] {
  const runs = documentRuns(graph);
  return [
    ...runs.plain,
    ...runs.sealed,
    ...allComponents(graph).map((c) => c.doc.template?.children ?? []),
  ];
}

/** The `part`s the page's components expose, or `'any'` when one is an expression. */
function partsOf(graph: DocumentGraph): ReadonlySet<string> | 'any' {
  const parts = new Set<string>();
  let open = false;
  for (const comp of allComponents(graph)) {
    walkElements(comp.doc.template?.children ?? [], (el) => {
      for (const attr of el.attributes) {
        if (attr.name !== 'part') continue;
        const value = literalValue(attr);
        if (value === null) open = true;
        else for (const w of words(value)) parts.add(w);
      }
    });
  }
  return open ? 'any' : parts;
}

/**
 * The light DOM of the page: `html` and `body` always, the layout's body, the route and its
 * sections — snippets already expanded into them — and, of each component used there, its
 * host and its projected content. Never a template: that CSS does not reach it.
 */
export function documentSurface(graph: DocumentGraph): ScopeSurface {
  const b = new SurfaceBuilder();
  b.tags.add('html');
  b.tags.add('body');
  const runs = documentRuns(graph);
  // The shell's own attributes (`<html lang>`, `<body data-theme>`). `element` does not
  // descend, and the runs below are its children.
  for (const shell of runs.shells) b.element(shell);
  for (const run of runs.plain) b.markup(run);
  for (const run of runs.sealed) b.sealed(run);
  return b.build(null, partsOf(graph));
}

/**
 * What the page projects into the hosts of `tag`: the elements at the top of each host's
 * light DOM — the only ones `::slotted()` matches — wherever in the page that host is written.
 */
function slottedInto(graph: DocumentGraph, tag: string): ScopeSurface {
  const b = new SurfaceBuilder();
  for (const run of allRuns(graph)) {
    walkElements(run, (el) => {
      if (el.name !== tag) return;
      for (const child of rootElements(el.children)) b.element(child);
    });
  }
  return b.build(null, 'any');
}

/**
 * The shadow root of a component: its template in every branch, the snippets rendered there
 * (expanded into it), and the hosts it uses with the content it projects into them.
 */
export function shadowSurface(graph: DocumentGraph, tag: string): ScopeSurface {
  const b = new SurfaceBuilder();
  b.markup(componentOf(graph, tag)?.doc.template?.children ?? []);
  return b.build(slottedInto(graph, tag), partsOf(graph));
}

/** The union of several surfaces: what a sheet adopted by several components can match. */
export function unionSurfaces(surfaces: readonly ScopeSurface[]): ScopeSurface {
  const b = new SurfaceBuilder();
  const slotted: ScopeSurface[] = [];
  let parts: Set<string> | 'any' = new Set();
  for (const s of surfaces) {
    for (const t of s.tags) b.tags.add(t);
    for (const c of s.classes) b.classes.add(c);
    for (const i of s.ids) b.ids.add(i);
    for (const [name, values] of s.attributes) {
      const seen = b.attributes.get(name);
      if (values === null || seen === null) b.attributes.set(name, null);
      else b.attributes.set(name, new Set([...(seen ?? []), ...values]));
    }
    b.openClasses ||= s.openClasses;
    b.openIds ||= s.openIds;
    if (s.slotted !== null) slotted.push(s.slotted);
    if (s.parts === 'any' || parts === 'any') parts = 'any';
    else parts = new Set([...parts, ...s.parts]);
  }
  return b.build(slotted.length === 0 ? null : unionSurfaces(slotted), parts);
}
