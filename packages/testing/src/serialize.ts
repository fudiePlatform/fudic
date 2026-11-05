/**
 * A painted piece back to markup (SDD-78): every shadow root written as the declarative one it
 * came from, with the sheets it adopted inline, so the markup draws the same anywhere — a chat's
 * sandboxed frame included. No script and no comment: the hydration's markers and its maps are
 * the page's machinery, not what it shows.
 */

import { sourceOf } from './dsd.js';

/** Elements that have no end tag. */
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

function escapeText(text: string): string {
  return text.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;');
}

function escapeAttribute(value: string): string {
  return value.replace(/&/gu, '&amp;').replace(/"/gu, '&quot;');
}

/** The text of a sheet: the one it was made from, or else rule by rule. */
function cssOf(sheet: CSSStyleSheet): string {
  return sourceOf.get(sheet) ?? [...sheet.cssRules].map((rule) => rule.cssText).join('\n');
}

function shadowOf(root: ShadowRoot): string {
  const styles = root.adoptedStyleSheets.map((sheet) => `<style>${cssOf(sheet)}</style>`).join('');
  return `<template shadowrootmode="${root.mode}">${styles}${childrenOf(root)}</template>`;
}

function childrenOf(parent: ParentNode): string {
  return [...parent.childNodes].map(nodeOf).join('');
}

function nodeOf(node: Node): string {
  if (node.nodeType === node.TEXT_NODE) {
    // The text of a `<style>` is CSS, not markup.
    return node.parentElement?.localName === 'style' ? node.textContent! : escapeText(node.textContent!);
  }
  if (node.nodeType !== node.ELEMENT_NODE) return '';
  return elementOf(node as Element);
}

/** `element` and what is under it, its shadow root first, as a parser would read it back. */
export function elementOf(element: Element): string {
  const tag = element.localName;
  if (tag === 'script') return '';
  const attributes = [...element.attributes].map((a) => ` ${a.name}="${escapeAttribute(a.value)}"`).join('');
  if (VOID.has(tag)) return `<${tag}${attributes}>`;
  const shadow = element.shadowRoot === null ? '' : shadowOf(element.shadowRoot);
  const inner = tag === 'template' ? childrenOf((element as HTMLTemplateElement).content) : childrenOf(element);
  return `<${tag}${attributes}>${shadow}${inner}</${tag}>`;
}

/** The markup of `element`: itself for a component, the children of `<body>` for a page. */
export function serialize(element: Element): string {
  return element.localName === 'body' ? childrenOf(element) : elementOf(element);
}

/**
 * A whole document around `html`: the sheets of `doc`'s `<head>` — the project's global ones
 * among them — inline, and nothing that runs.
 */
export function previewDocument(doc: Document, html: string): string {
  const sheets = [...doc.head.querySelectorAll('style')].map((style) => `<style>${style.textContent}</style>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8">${sheets}</head><body>${html}</body></html>`;
}
