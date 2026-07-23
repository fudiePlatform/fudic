/**
 * Tree serialization (SDD-14 §3.2, §4.3 · SDD-16 §4.1). One lazy walk, three
 * consumers: `renderToString` joins it, `renderToStream` encodes it, and the
 * emit's `async function*` (SDD-15) reuses the same exported escaping rules.
 *
 * Rules:
 *  - void elements (`img`, `br`, …) self-close: no children, no closing tag;
 *  - rawtext elements (`script`, `style`) emit their text children UNescaped;
 *  - a shadow root serializes as
 *    `<template shadowrootmode="open" shadowrootadoptedstylesheets="<host-tag>">…</template>`,
 *    the first thing inside its host. No `host="tag"` marker is emitted; the
 *    `<style host>` mechanism is retired. Component styles are a shared sheet
 *    named by the host tag: `<style type="module" specifier="<tag>">` in the page
 *    head (emit, SDD-15 §4.8) plus `shadowrootadoptedstylesheets="<tag>"` here.
 *    Standard attributes only — the specifier IS the tag, no invented namespace;
 *    the polyfill is a pure feature-detected fallback, so native support needs
 *    zero change (SDD-18);
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

/**
 * The single tree walk, as a LAZY generator of HTML text pieces (one per node
 * boundary). Emits the exact same pieces `renderToString` used to concatenate.
 */
export function serializeChunks(root: SsrNode): Generator<string> {
  return serialize(asImpl(root));
}

/** Unchanged contract (SDD-14 §3.2), now joined over the shared walk. */
export function renderToString(root: SsrNode): string {
  return [...serializeChunks(root)].join('');
}

function* serialize(n: SsrNodeImpl): Generator<string> {
  switch (n.kind) {
    case 'text':
      yield escapeText(n.data);
      return;
    case 'comment':
      yield `<!--${neutralizeComment(n.data)}-->`;
      return;
    case 'fragment':
      yield* serializeChildren(n);
      return;
    case 'element':
      yield* serializeElement(n);
      return;
  }
}

function* serializeElement(n: SsrNodeImpl): Generator<string> {
  const tag = n.tag as string;
  yield `<${tag}${serializeAttrs(n)}>`;

  if (VOID_ELEMENTS.has(tag.toLowerCase())) {
    return; // no children, no closing tag
  }

  if (n.shadow !== null) {
    // DSD template adopts the component's shared stylesheet, named by the host tag
    // (SDD-18). Standard form emitted day one so native support needs zero change.
    yield `<template shadowrootmode="open" shadowrootadoptedstylesheets="${escapeAttr(tag)}">`;
    yield* serializeChildren(n.shadow);
    yield '</template>';
  }

  if (RAWTEXT_ELEMENTS.has(tag.toLowerCase())) {
    yield* rawChildren(n);
  } else {
    yield* serializeChildren(n);
  }

  yield `</${tag}>`;
}

function* serializeChildren(n: SsrNodeImpl): Generator<string> {
  for (const child of n.children) {
    yield* serialize(child);
  }
}

/** Rawtext children: text emitted verbatim; anything else falls back to normal. */
function* rawChildren(n: SsrNodeImpl): Generator<string> {
  for (const child of n.children) {
    if (child.kind === 'text') {
      yield child.data;
    } else {
      yield* serialize(child);
    }
  }
}

function serializeAttrs(n: SsrNodeImpl): string {
  let out = '';
  for (const [name, value] of n.attrs) {
    out += ` ${name}="${escapeAttr(value)}"`;
  }
  return out;
}

/** Escape for text context: `& < >`. */
export function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Escape for attribute-value context: `& "`. */
export function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/** Neutralize an inner `-->` so anchor comments (`<!--fud:if-->`) cannot break out. */
export function neutralizeComment(s: string): string {
  return s.replace(/-->/g, '--&gt;');
}
