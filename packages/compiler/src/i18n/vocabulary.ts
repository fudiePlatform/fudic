/**
 * What the view translates without being told (SDD-58 §4.1, §4.2, decisions 159 and 160): the
 * phrasing elements a phrase can hold, and the attributes whose value is text for a person.
 */

import type { Attribute, ElementNode } from '../html/index.js';

/** A message has at least one letter: text that is only spaces, digits or signs is not one. */
export const LETTER = /\p{L}/u;

/** The phrasing elements a phrase can hold as `<n>…</n>`; any other element cuts it (§4.2). */
export const PHRASING: ReadonlySet<string> = new Set([
  'a',
  'abbr',
  'b',
  'bdi',
  'bdo',
  'br',
  'cite',
  'code',
  'data',
  'dfn',
  'em',
  'i',
  'kbd',
  'mark',
  'output',
  'q',
  's',
  'samp',
  'slot',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'time',
  'u',
  'var',
  'wbr',
]);

/** Attributes translated on any element: HTML's own and ARIA's. */
const ANY_ELEMENT: ReadonlySet<string> = new Set([
  'title',
  'alt',
  'placeholder',
  'aria-label',
  'aria-description',
  'aria-placeholder',
  'aria-roledescription',
  'aria-valuetext',
]);

/** Attributes translated only on some elements, by element. */
const ON_ELEMENT: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['abbr', new Set(['th'])],
  ['label', new Set(['option', 'optgroup', 'track'])],
  ['download', new Set(['a', 'area'])],
]);

/** The `type`s of `<input>` whose `value` is the text of a button. */
const BUTTON_INPUTS: ReadonlySet<string> = new Set(['button', 'submit', 'reset']);

/** The static text of an attribute of `el`, lowercased, or `undefined` when it has none. */
export function staticAttr(el: ElementNode, name: string): string | undefined {
  const attr = el.attributes.find((a) => typeof a.name === 'string' && a.name.toLowerCase() === name);
  const only = attr?.value.length === 1 ? attr.value[0] : undefined;
  return only?.type === 'attribute-text' ? only.value.trim().toLowerCase() : undefined;
}

/** `translate="no"`: the element and everything inside it stay as written (§4.1). */
export function translateNo(el: ElementNode): boolean {
  return staticAttr(el, 'translate') === 'no';
}

/** Whether `attr` of `el` is text for a person, from the standard's list (§4.1). */
export function translatableAttr(el: ElementNode, attr: Attribute): boolean {
  if (typeof attr.name !== 'string') return false;
  const name = attr.name.toLowerCase();
  const element = el.name.toLowerCase();
  if (ANY_ELEMENT.has(name)) return true;
  if (ON_ELEMENT.get(name)?.has(element) === true) return true;
  if (name === 'value') return element === 'input' && BUTTON_INPUTS.has(staticAttr(el, 'type') ?? '');
  return name === 'content' && element === 'meta' && staticAttr(el, 'name') === 'description';
}

/** ICU-escape literal text: `'` doubled, `{`/`}` quoted, and a `<` that would read as a tag. */
export function escapeIcu(text: string): string {
  // One scan: a special opens a quoted run and the next ordinary character closes it. An
  // apostrophe is `''` in or out of quotes, so it neither opens nor closes one — which is what
  // keeps `{'}` from closing its quote on the apostrophe in the middle.
  let out = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === "'") {
      out += "''";
      continue;
    }
    const special = c === '{' || c === '}' || (c === '<' && /^\/?\d/u.test(text.slice(i + 1)));
    if (special !== quoted) out += "'";
    quoted = special;
    out += c;
  }
  return quoted ? `${out}'` : out;
}

/** Whitespace collapsed and trimmed: the form a message is keyed and translated in. */
export function normalizeSpace(text: string): string {
  return text.replace(/\s+/gu, ' ').trim();
}
