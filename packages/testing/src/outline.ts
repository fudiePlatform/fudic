/**
 * `outline`: a painted piece as a screen reader meets it, written in Playwright's ARIA snapshot
 * format so the same piece reads the same in happy-dom and in a browser.
 *
 * It walks the FLAT tree: into every shadow root, and through every `<slot>` to what is assigned
 * to it (or its fallback). An element with a role is a line — its role, its accessible name in
 * quotes, its states in brackets — and its children go under it; one without a role writes
 * nothing of its own, and its children rise to its level. Loose text is `- text: …`.
 *
 * What happy-dom cannot know — what CSS hides, what depends on layout — is not here: that is
 * what the browser is for.
 */

import { computeAccessibleName, getRole, isDisabled, isInaccessible } from 'dom-accessibility-api';

/** A node of the tree before it is written: a role with its children, or a run of text. */
interface AriaNode {
  readonly role: string;
  readonly name: string;
  readonly states: readonly string[];
  /** `/url`, `/placeholder`: what Playwright writes as a child property. */
  readonly props: readonly (readonly [string, string])[];
  readonly children: (AriaNode | string)[];
}

/** Elements that are never content. */
const SKIPPED = new Set(['script', 'style', 'template', 'head', 'noscript']);

/** Roles that say nothing: their children rise to their level. */
const SILENT = new Set(['generic', 'none', 'presentation']);

/** Where `checked` is a state of the role. */
const CHECKABLE = new Set(['checkbox', 'radio', 'switch', 'menuitemcheckbox', 'menuitemradio', 'treeitem']);

/** Where `disabled` is a state: the roles of controls and their containers. */
const DISABLABLE = new Set([
  'button', 'checkbox', 'combobox', 'gridcell', 'link', 'listbox', 'menuitem', 'menuitemcheckbox',
  'menuitemradio', 'option', 'radio', 'radiogroup', 'scrollbar', 'searchbox', 'separator', 'slider',
  'spinbutton', 'switch', 'tab', 'textbox', 'treeitem', 'group', 'menu', 'menubar', 'tablist', 'toolbar',
  'tree', 'treegrid', 'grid', 'row', 'columnheader', 'rowheader',
]);

/** The text of a piece's accessibility tree: one line per element with a role, children indented by two. */
export function outline(root: Element | Document | ShadowRoot): string {
  const top: (AriaNode | string)[] = [];
  if (isElement(root)) visit(root, top);
  else for (const child of flatChildren(root)) visit(child, top);
  const lines: string[] = [];
  for (const node of merged(top)) write(node, '', lines, null);
  return lines.join('\n');
}

function isElement(node: Node): node is Element {
  return node.nodeType === 1;
}

/** The children of a node in the flat tree: its shadow root's, a slot's assigned nodes, or its own. */
function flatChildren(node: Node): Node[] {
  if (isElement(node)) {
    if (node.shadowRoot !== null) return [...node.shadowRoot.childNodes];
    if (node.localName === 'slot') {
      const assigned = (node as HTMLSlotElement).assignedNodes();
      return assigned.length > 0 ? assigned : [...node.childNodes];
    }
  }
  return [...node.childNodes];
}

function visit(node: Node, into: (AriaNode | string)[]): void {
  if (node.nodeType === 3) {
    into.push(node.textContent ?? '');
    return;
  }
  if (!isElement(node) || SKIPPED.has(node.localName) || isInaccessible(node)) return;
  const role = roleOf(node);
  if (role === null || SILENT.has(role)) {
    // A box that is not inline separates its text from its neighbours', as the browser lays it out.
    const block = getComputedStyle(node).display !== 'inline';
    if (block) into.push(' ');
    for (const child of flatChildren(node)) visit(child, into);
    if (block) into.push(' ');
    return;
  }
  const children: (AriaNode | string)[] = [];
  for (const child of flatChildren(node)) visit(child, children);
  const value = valueOf(node);
  if (value !== '') children.push(value);
  const name = nameOf(node);
  into.push({ role, name, states: statesOf(node, role), props: propsOf(node, role, name), children });
}

/** The accessible name; a field with no other name is named by its placeholder, as the browser does. */
function nameOf(element: Element): string {
  const name = normalize(computeAccessibleName(element));
  return name === '' ? normalize(element.getAttribute('placeholder') ?? '') : name;
}

/**
 * The implicit roles the browser gives and `dom-accessibility-api` does not: the text-level ones.
 * A `<legend>` has none — its text joins what follows it.
 */
const IMPLICIT: ReadonlyMap<string, string | null> = new Map([
  ['p', 'paragraph'],
  ['blockquote', 'blockquote'],
  ['code', 'code'],
  ['em', 'emphasis'],
  ['strong', 'strong'],
  ['del', 'deletion'],
  ['ins', 'insertion'],
  ['sub', 'subscript'],
  ['sup', 'superscript'],
  ['time', 'time'],
  ['caption', 'caption'],
  ['dfn', 'term'],
  ['legend', null],
]);

/** Where a `<header>` or `<footer>` is no longer the page's banner or content info. */
const SECTIONING = new Set(['article', 'aside', 'main', 'nav', 'section']);

/** An element's role as the browser computes it: the author's first, then the implicit one. */
function roleOf(element: Element): string | null {
  if (element.hasAttribute('role')) return getRole(element);
  const name = element.localName;
  const implicit = IMPLICIT.get(name);
  if (implicit !== undefined) return implicit;
  if ((name === 'header' || name === 'footer') && inSection(element)) return null;
  return getRole(element);
}

function inSection(element: Element): boolean {
  for (let at = parentOf(element); at !== null; at = parentOf(at)) {
    if (SECTIONING.has(at.localName)) return true;
  }
  return false;
}

/** The text a field holds, as Playwright writes it: a text child. A `<select>` shows none. */
function valueOf(element: Element): string {
  if (element.localName === 'textarea') return (element as HTMLTextAreaElement).value;
  if (element.localName !== 'input') return '';
  const input = element as HTMLInputElement;
  return CHOICES.has(input.type) ? '' : input.value;
}

/** Inputs whose value is not text a person reads. */
const CHOICES = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'image', 'file', 'range', 'color', 'hidden']);

function statesOf(element: Element, role: string): string[] {
  const states: string[] = [];
  const checked = checkedOf(element, role);
  if (checked === 'mixed') states.push('checked=mixed');
  else if (checked) states.push('checked');
  if (DISABLABLE.has(role) && disabledOf(element)) states.push('disabled');
  if (element.getAttribute('aria-expanded') === 'true') states.push('expanded');
  const level = levelOf(element, role);
  if (level !== undefined) states.push(`level=${level}`);
  const pressed = element.getAttribute('aria-pressed');
  if (pressed === 'mixed') states.push('pressed=mixed');
  else if (pressed === 'true') states.push('pressed');
  if (selectedOf(element, role)) states.push('selected');
  return states;
}

function checkedOf(element: Element, role: string): boolean | 'mixed' {
  if (!CHECKABLE.has(role)) return false;
  // A native checkbox or radio says its own state, whatever `aria-checked` claims.
  const input = element as HTMLInputElement;
  if (element.localName === 'input' && (input.type === 'checkbox' || input.type === 'radio')) {
    return input.indeterminate ? 'mixed' : input.checked;
  }
  const aria = element.getAttribute('aria-checked');
  return aria === 'mixed' ? 'mixed' : aria === 'true';
}

/**
 * Disabled by itself, by `aria-disabled` on it or an ancestor, or by a disabled fieldset around
 * it. A disabled fieldset disables what it holds, not its own group.
 */
function disabledOf(element: Element): boolean {
  if (element.localName !== 'fieldset' && isDisabled(element)) return true;
  for (let at: Element | null = element; at !== null; at = parentOf(at)) {
    if (at.getAttribute('aria-disabled') === 'true') return true;
    if (at !== element && at.localName === 'fieldset' && at.hasAttribute('disabled')) return true;
  }
  return false;
}

/** The parent in the flat tree: a shadow root's host, a slotted element's slot. */
function parentOf(element: Element): Element | null {
  const slot = (element as Element & { assignedSlot?: Element | null }).assignedSlot;
  if (slot !== undefined && slot !== null) return slot;
  const parent = element.parentNode;
  if (parent === null) return null;
  if (isElement(parent)) return parent;
  return (parent as ShadowRoot).host ?? null;
}

function levelOf(element: Element, role: string): number | undefined {
  const aria = Number(element.getAttribute('aria-level'));
  if (Number.isInteger(aria) && aria > 0) return aria;
  if (role !== 'heading') return undefined;
  const heading = /^h([1-6])$/u.exec(element.localName);
  return heading === null ? 2 : Number(heading[1]);
}

function selectedOf(element: Element, role: string): boolean {
  const aria = element.getAttribute('aria-selected');
  if (aria !== null) return aria === 'true';
  return role === 'option' && (element as HTMLOptionElement).selected === true;
}

function propsOf(element: Element, role: string, name: string): [string, string][] {
  const props: [string, string][] = [];
  const href = element.getAttribute('href');
  if (role === 'link' && href !== null) props.push(['url', href]);
  const placeholder = normalize(element.getAttribute('placeholder') ?? '');
  if (placeholder !== '' && placeholder !== name) props.push(['placeholder', placeholder]);
  return props;
}

function normalize(text: string): string {
  return text.replace(/\s+/gu, ' ').trim();
}

/** Adjacent runs of text are one, with its whitespace collapsed; an empty one is nothing. */
function merged(children: readonly (AriaNode | string)[]): (AriaNode | string)[] {
  const out: (AriaNode | string)[] = [];
  let text = '';
  const flush = (): void => {
    const run = normalize(text);
    if (run !== '') out.push(run);
    text = '';
  };
  for (const child of children) {
    if (typeof child === 'string') text += child;
    else {
      flush();
      out.push(child);
    }
  }
  flush();
  return out;
}

function write(node: AriaNode | string, indent: string, lines: string[], parent: AriaNode | null): void {
  if (typeof node === 'string') {
    if (parent === null || includesText(parent, node)) lines.push(`${indent}- text: ${yamlValue(node)}`);
    return;
  }
  const key = [node.role, ...(node.name === '' ? [] : [JSON.stringify(node.name)]), ...node.states.map((s) => `[${s}]`)].join(' ');
  const children = merged(node.children);
  const only = children[0];
  if (children.length === 0 && node.props.length === 0) {
    lines.push(`${indent}- ${key}`);
  } else if (children.length === 1 && typeof only === 'string' && node.props.length === 0) {
    lines.push(includesText(node, only) ? `${indent}- ${key}: ${yamlValue(only)}` : `${indent}- ${key}`);
  } else {
    lines.push(`${indent}- ${key}:`);
    for (const [name, value] of node.props) lines.push(`${indent}  - /${name}: ${yamlValue(value)}`);
    for (const child of children) write(child, `${indent}  `, lines, node);
  }
}

/** A text that is the name itself is not repeated under it; any other is. */
function includesText(node: AriaNode, text: string): boolean {
  return node.name !== text;
}

/** A YAML scalar, quoted only when it has to be. */
function yamlValue(text: string): string {
  const needs =
    /^[\s\-?:,[\]{}#&*!|>'"%@`]/u.test(text) ||
    /[\s]$/u.test(text) ||
    /: |\s#|:$/u.test(text) ||
    /^(?:true|false|null|~|-?\d+(?:\.\d+)?)$/iu.test(text);
  return needs ? JSON.stringify(text) : text;
}
