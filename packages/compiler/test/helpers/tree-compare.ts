/**
 * A tree written out so two of them can be compared node for node (SDD-85 §6, criterion 8).
 *
 * Strict in everything the DOM shows: the kind of every node, its name, its namespace, its text,
 * and the order of the nodes. Two things are left out, and only those two, because neither the
 * DOM nor CSS can see them (SDD-85 §5, §8.2 decision 22):
 *
 * - **the order of the attributes**: they are written sorted by name, as a set;
 * - **where one text node ends and the next begins**: adjacent texts are one, and an empty one is
 *   none — HTML has no boundary between two texts, so a parsed tree never has either.
 *
 * And the third exception of §5, the `class=""` an emptied class list leaves in the browser, is
 * the caller's to allow: `emptyClass: true` writes an empty `class` as no attribute.
 *
 * A shadow root is not part of the tree it hangs from: each side's own hosts are compared by
 * their light DOM. The content of a `<template>` is, as the parser puts it there.
 */

const NAMESPACES: Readonly<Record<string, string>> = {
  'http://www.w3.org/1999/xhtml': '',
  'http://www.w3.org/2000/svg': 'svg:',
  'http://www.w3.org/1998/Math/MathML': 'math:',
};

export interface TreeOptions {
  /** Whether an empty `class` counts as no attribute (SDD-85 §4.5, rule 3). */
  readonly emptyClass?: boolean;
  /**
   * Attributes left out: `data-fud-id`, which the server writes on the hosts it paints because
   * only the page knows its instances (SDD-15 §3.1), and an instance created at runtime has none.
   */
  readonly skip?: readonly string[];
}

/** The children of `root`, one node per line, indented by depth. */
export function treeOf(root: Node, options: TreeOptions = {}): string {
  const lines: string[] = [];
  walk(root, 0, lines, options);
  return lines.join('\n');
}

function walk(parent: Node, depth: number, out: string[], options: TreeOptions): void {
  const pad = '  '.repeat(depth);
  let text: string | null = null;
  const flush = (): void => {
    if (text !== null && text !== '') out.push(`${pad}${JSON.stringify(text)}`);
    text = null;
  };
  const children =
    parent instanceof HTMLTemplateElement ? parent.content.childNodes : parent.childNodes;
  for (const node of children) {
    if (node.nodeType === Node.TEXT_NODE) {
      text = (text ?? '') + (node as Text).data;
      continue;
    }
    flush();
    if (node.nodeType === Node.COMMENT_NODE) {
      out.push(`${pad}<!--${(node as Comment).data}-->`);
      continue;
    }
    const el = node as Element;
    const ns = NAMESPACES[el.namespaceURI ?? ''] ?? `${el.namespaceURI}:`;
    const attrs = [...el.attributes]
      .filter((a) => !(options.emptyClass === true && a.name === 'class' && a.value === ''))
      .filter((a) => !(options.skip ?? []).includes(a.name))
      .map((a) => `${a.name}=${JSON.stringify(a.value)}`)
      .sort();
    out.push(`${pad}<${ns}${el.localName}${attrs.map((a) => ` ${a}`).join('')}>`);
    walk(el, depth + 1, out, options);
  }
  flush();
}
