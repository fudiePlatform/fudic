/**
 * `baseline-html` (SDD-83 §3.6, §4.3): the markup of a `.fud` against the project's Baseline.
 *
 * Each element, attribute and event of HTML becomes the compat keys it may read as, most specific
 * first, and the first one the table has is judged: `<search>` is `html.elements.search`, `popover`
 * is `html.global_attributes.popover`, `<input type="color">` is `html.elements.input.type_color`,
 * `@toggle` on a `<div>` is `api.HTMLDivElement.toggle_event` or the event of a base interface.
 *
 * What is not HTML is not looked at: a component's tag and everything on it (its attributes are
 * props, its events its own), and fudic's own syntax — `.prop`, `class:x`, `delegate:click`, `ref`.
 * A bound value (`type=@kind`) gives the attribute's key and not its value's: fudic cannot know it.
 *
 * Silent with no `baseline` in the input: the host could not say what the project asks for.
 */

import { firstKnown, tagInterface } from '@fudic/baseline';
import type { Attribute, ElementNode, HtmlContent } from '../../html/index.js';
import { span } from '../../types/index.js';
import type { Analyzer } from '../model.js';
import { judgeUses, type BaselineUse } from '../baseline.js';
import { documentRoots, walk } from '../walk.js';

/** An attribute name of HTML: letters, digits and dashes. Anything else is fudic's syntax. */
const HTML_NAME = /^[a-z][a-z0-9-]*$/iu;
/** A value that can be the last segment of a key: `color`, `any`, `datetime-local`. */
const KEY_VALUE = /^[a-z0-9][a-z0-9-]*$/iu;
/** An event of fudic, `@toggle`, with any modifiers after a dot (`@keydown.enter`). */
const EVENT = /^@([a-z][a-z0-9]*)/iu;

/** The prefix of an element's key in each namespace. */
const ELEMENTS = { html: 'html.elements', svg: 'svg.elements', math: 'mathml.elements' } as const;

export const baselineHtml: Analyzer = {
  name: 'baseline-html',
  run(input, report) {
    const context = input.baseline;
    if (context === undefined) return;
    for (const found of judgeUses(htmlBaselineUses(documentRoots(input.document)), context)) report(found);
  },
};

/** Every use of the browser in the markup under `roots`: what the detector reads, before the judge. */
export function htmlBaselineUses(roots: readonly HtmlContent[]): BaselineUse[] {
  const uses: BaselineUse[] = [];
  walk(roots, {
    element(el) {
      // A component is not HTML: its tag, its props and its events are its own.
      if (!el.name.includes('-')) uses.push(...elementUses(el));
    },
  });
  return uses;
}

/** What one element of HTML, SVG or MathML reads as: its tag, then each attribute and event. */
function elementUses(el: ElementNode): BaselineUse[] {
  const tag = el.namespace === 'html' ? el.name.toLowerCase() : el.name;
  const uses: BaselineUse[] = [];
  const key = firstKnown([`${ELEMENTS[el.namespace]}.${tag}`]);
  // The name is written right after the `<`.
  const at = el.openSpan.start + 1;
  if (key !== undefined) uses.push({ name: `<${el.name}>`, key, span: span(at, at + el.name.length) });
  for (const attr of el.attributes) {
    const use = el.namespace === 'html' ? attributeUse(tag, attr) : undefined;
    if (use !== undefined) uses.push(use);
  }
  return uses;
}

/** What one attribute of an HTML element reads as: an event, or an attribute and its literal value. */
function attributeUse(tag: string, attr: Attribute): BaselineUse | undefined {
  if (typeof attr.name !== 'string') return undefined;
  // The attribute is written name first: its span opens on the name.
  const at = span(attr.span.start, attr.span.start + attr.name.length);
  const event = EVENT.exec(attr.name);
  if (event !== null) {
    const name = event[1]!.toLowerCase();
    const key = firstKnown([tagInterface(tag), 'HTMLElement', 'Element'].map((i) => `api.${i}.${name}_event`));
    return key === undefined ? undefined : { name: `@${name}`, key, span: at };
  }
  if (!HTML_NAME.test(attr.name)) return undefined;
  const name = attr.name.toLowerCase();
  const value = literalValue(attr);
  const ofValue = value === undefined ? [] : [`html.elements.${tag}.${name}_${value}`, `html.elements.${tag}.${name}.${value}`];
  const key = firstKnown([...ofValue, `html.elements.${tag}.${name}`, `html.global_attributes.${name}`]);
  if (key === undefined) return undefined;
  const written = ofValue.includes(key) ? `${name}="${value}"` : name;
  return { name: written, key, span: at };
}

/** The value of an attribute written as plain text, lower case, when it can end a key. */
function literalValue(attr: Attribute): string | undefined {
  if (attr.value.length === 0 || attr.value.some((part) => part.type !== 'attribute-text')) return undefined;
  const text = attr.value
    .map((part) => (part as { readonly value: string }).value)
    .join('')
    .trim()
    .toLowerCase();
  return KEY_VALUE.test(text) ? text : undefined;
}
