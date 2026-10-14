/**
 * The server's HTML, made the document (§4.2, steps 2 and 3; §4.9).
 *
 * The `<html>` attributes and the `<head>` go in as they are. The `<body>` is a NEW element
 * that replaces the old one: its content goes in through `fragmentOf`, with every declarative
 * shadow root applied, and whatever was listening on the previous body — the capturer of the
 * previous test's hydration among them — goes away with it.
 */

import { fragmentOf } from './dsd.js';

/** Copy the attributes written in `<tag …attrs>` onto `target`, dropping the ones it had. */
function setAttributes(target: Element, attrs: string): void {
  for (const name of target.getAttributeNames()) target.removeAttribute(name);
  const holder = document.createElement('template');
  holder.innerHTML = `<div${attrs}></div>`;
  for (const attr of holder.content.firstElementChild!.attributes) target.setAttribute(attr.name, attr.value);
}

/** The attributes of the first `<tag …>` in `html`. */
function attrsOf(html: string, tag: string): string {
  return new RegExp(`<${tag}(\\s[^>]*)?>`, 'u').exec(html)?.[1] ?? '';
}

/** The text between the end of the first `<tag …>` and the last `</tag>`. */
function innerOf(html: string, tag: string): string {
  const open = new RegExp(`<${tag}(\\s[^>]*)?>`, 'u').exec(html)!;
  return html.slice(open.index + open[0].length, html.lastIndexOf(`</${tag}>`));
}

/** Make `html` — a whole page, as the server answers it — the document. Hands back its body. */
export function showPage(html: string): HTMLElement {
  setAttributes(document.documentElement, attrsOf(html, 'html'));
  document.head.innerHTML = innerOf(html, 'head');
  const body = document.createElement('body');
  setAttributes(body, attrsOf(html, 'body'));
  body.append(fragmentOf(innerOf(html, 'body')));
  document.documentElement.replaceChild(body, document.body);
  return body;
}

/**
 * The page `html` is, with an EMPTY body: its `<html>` and its `<head>` — the stylesheets a
 * component adopts by specifier live there — and nothing the server painted. Where `mount`
 * with `via: 'client'` creates its component, as a parent does in a page that is already up.
 */
export function pageShell(html: string): HTMLElement {
  const [before] = html.split(/<body[\s>]/u);
  return showPage(`${before!}<body></body></html>`);
}

/** An empty document: what the cleanup leaves between two tests. Hands back its body. */
export function blankPage(): HTMLElement {
  return showPage('<html><head></head><body></body></html>');
}

/** The value of `attr` on the first `<tag>` of the body of `html`, or `null`. */
export function hostAttribute(html: string, tag: string, attr: string): string | null {
  const holder = document.createElement('template');
  holder.innerHTML = innerOf(html, 'body');
  return holder.content.querySelector(tag)!.getAttribute(attr);
}
