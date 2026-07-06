/**
 * `renderToString` — serialize an SSR tree to HTML (SDD-14 §3.2, §4.3).
 *
 * Rules:
 *  - void elements (`img`, `br`, …) self-close: no children, no closing tag;
 *  - rawtext elements (`script`, `style`) emit their text children UNescaped —
 *    this is also how a `<style host>` sheet lands inline inside the DSD template;
 *  - a shadow root serializes as `<template shadowrootmode="open">…</template>`,
 *    the first thing inside its host;
 *  - text is escaped for text context (`& < >`), attribute values for attribute
 *    context (`& "`); a comment neutralizes an inner `-->`.
 */

import { type SsrNode, type SsrNodeImpl, asImpl } from './tree.js';

/** https://html.spec.whatwg.org/#void-elements */
const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

/** Elements whose text content must NOT be escaped. */
const RAWTEXT_ELEMENTS = new Set(['script', 'style']);

export function renderToString(root: SsrNode): string {
  return serialize(asImpl(root));
}

function serialize(n: SsrNodeImpl): string {
  switch (n.kind) {
    case 'text':
      return escapeText(n.data);
    case 'comment':
      return `<!--${neutralizeComment(n.data)}-->`;
    case 'fragment':
      return serializeChildren(n);
    case 'element':
      return serializeElement(n);
  }
}

function serializeElement(n: SsrNodeImpl): string {
  const tag = n.tag as string;
  const open = `<${tag}${serializeAttrs(n)}>`;

  if (VOID_ELEMENTS.has(tag.toLowerCase())) {
    return open; // no children, no closing tag
  }

  const shadow =
    n.shadow !== null
      ? `<template shadowrootmode="open">${serializeChildren(n.shadow)}</template>`
      : '';

  const body = RAWTEXT_ELEMENTS.has(tag.toLowerCase())
    ? rawChildren(n)
    : serializeChildren(n);

  return `${open}${shadow}${body}</${tag}>`;
}

function serializeChildren(n: SsrNodeImpl): string {
  let out = '';
  for (const child of n.children) {
    out += serialize(child);
  }
  return out;
}

/** Rawtext children: text emitted verbatim; anything else falls back to normal. */
function rawChildren(n: SsrNodeImpl): string {
  let out = '';
  for (const child of n.children) {
    out += child.kind === 'text' ? child.data : serialize(child);
  }
  return out;
}

function serializeAttrs(n: SsrNodeImpl): string {
  let out = '';
  for (const [name, value] of n.attrs) {
    out += ` ${name}="${escapeAttr(value)}"`;
  }
  return out;
}

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function neutralizeComment(s: string): string {
  return s.replace(/-->/g, '--&gt;');
}
