/**
 * `htmlOf`: a painted piece back to markup in a real browser, the same way `@fudic/testing`
 * serializes it under happy-dom — every shadow root written as the declarative one it came from,
 * its adopted sheets inline, and no script and no comment.
 */

import type { Page } from 'playwright-core';

/** Runs in the page, on the element: plain JS, since this package has no DOM types. */
const SERIALIZE = `(root) => {
  const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
  const escapeText = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escapeAttribute = (value) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const cssOf = (sheet) => [...sheet.cssRules].map((rule) => rule.cssText).join('\\n');
  const childrenOf = (parent) => [...parent.childNodes].map(nodeOf).join('');
  const shadowOf = (shadow) => {
    const styles = shadow.adoptedStyleSheets.map((sheet) => '<style>' + cssOf(sheet) + '</style>').join('');
    return '<template shadowrootmode="' + shadow.mode + '">' + styles + childrenOf(shadow) + '</template>';
  };
  function elementOf(element) {
    const tag = element.localName;
    if (tag === 'script') return '';
    // The bench paints in dev mode: data-fud-src points into its own pages and says nothing to a reader.
    const attributes = [...element.attributes].filter((a) => a.name !== 'data-fud-src').map((a) => ' ' + a.name + '="' + escapeAttribute(a.value) + '"').join('');
    if (VOID.has(tag)) return '<' + tag + attributes + '>';
    const shadow = element.shadowRoot === null ? '' : shadowOf(element.shadowRoot);
    const inner = tag === 'template' ? childrenOf(element.content) : childrenOf(element);
    return '<' + tag + attributes + '>' + shadow + inner + '</' + tag + '>';
  }
  function nodeOf(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.parentElement?.localName === 'style' ? (node.textContent ?? '') : escapeText(node.textContent ?? '');
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    return elementOf(node);
  }
  return elementOf(root);
}`;

/** The markup of the first element `selector` matches; the error's first line, as text, when it cannot be read. */
export async function htmlOf(page: Page, selector: string): Promise<string> {
  try {
    // A string is evaluated as an expression, never called: wrapped, it runs on the element.
    const serialize = new Function('element', `return (${SERIALIZE})(element);`) as (element: unknown) => string;
    return await page.locator(selector).first().evaluate(serialize);
  } catch (error) {
    // Playwright rejects with an Error, always.
    return `error: ${(error as Error).message.split('\n')[0]}`;
  }
}
