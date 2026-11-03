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
  const role = getRole(node);
  if (role === null || SILENT.has(role)) {
    for (const child of flatChildren(node)) visit(child, into);
    return;
  }
  const children: (AriaNode | string)[] = [];
  for (const child of flatChildren(node)) visit(child, children);
  const value = valueOf(node, role);
  if (value !== '') children.push(value);
  into.push({
    role,
    name: normalize(computeAccessibleName(node)),
    states: statesOf(node, role),
    props: propsOf(node, role),
    children,
  });
}

/** The value a textbox shows, as Playwright writes it: a text child. */
function valueOf(element: Element, role: string): string {
  if (role !== 'textbox' && role !== 'searchbox' && role !== 'spinbutton' && role !== 'combobox') return '';
  const value = (element as HTMLInputElement).value;
  return typeof value === 'string' ? value : '';
}

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
  const aria = element.getAttribute('aria-checked');
  if (aria === 'mixed') return 'mixed';
  if (aria === 'true') return true;
  if (aria === 'false') return false;
  const input = element as HTMLInputElement;
  if (input.indeterminate === true) return 'mixed';
  return input.checked === true;
}

/** Disabled by itself, by `aria-disabled` on it or an ancestor, or by a disabled fieldset around it. */
function disabledOf(element: Element): boolean {
  if (isDisabled(element)) return true;
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

function propsOf(element: Element, role: string): [string, string][] {
  const props: [string, string][] = [];
  const href = element.getAttribute('href');
  if (role === 'link' && href !== null) props.push(['url', href]);
  const placeholder = element.getAttribute('placeholder');
  if (placeholder !== null && placeholder !== '' && placeholder !== normalize(computeAccessibleName(element))) {
    props.push(['placeholder', placeholder]);
  }
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

/** A text the name already says is not repeated under it. */
function includesText(node: AriaNode, text: string): boolean {
  return node.name === '' || !node.name.includes(text);
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
