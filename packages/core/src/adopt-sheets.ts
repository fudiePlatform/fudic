/**
 * TEMPORARY BRIDGE — the shared stylesheets of a component created in the browser (BUG-45).
 *
 * A host the server painted gets its sheets from its `<template shadowrootmode
 * shadowrootadoptedstylesheets>`: the parser (or the inline polyfill, before
 * `DOMContentLoaded`) adopts them. A host the runtime FABRICATES opens its shadow root with
 * `attachShadow`, which adopts nothing, and no platform API yet resolves a
 * `<style type="module" specifier>` for an imperative shadow root. So this module does it by
 * hand: it reads the specifiers off the host's `data-fud-adopt` (the same list the server
 * wrote on the template), finds each `<style type="module" specifier>` in the document, and
 * builds the sheet with `replaceSync`.
 *
 * It does NOT read the polyfill's sheets: the polyfill is dead code the day the browsers ship
 * the feature, and nothing in the runtime may depend on it.
 *
 * Isolated on purpose. When the platform can open a shadow root that adopts by specifier,
 * this file and its ONE call site in `element.ts` are deleted, and nothing else changes.
 */

/** One sheet per specifier, shared by every instance — parsed once, adopted by reference. */
const sheets = new Map<string, CSSStyleSheet>();

function sheetOf(doc: Document, specifier: string): CSSStyleSheet | undefined {
  const cached = sheets.get(specifier);
  if (cached !== undefined) return cached;
  // Compared, not interpolated into a selector: a specifier is data, not CSS syntax.
  for (const style of doc.querySelectorAll('style[type="module"][specifier]')) {
    if (style.getAttribute('specifier') !== specifier) continue;
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(style.textContent);
    sheets.set(specifier, sheet);
    return sheet;
  }
  // Not cached when missing: a sheet that is not in the document yet may still arrive.
  return undefined;
}

/** Adopt into `shadow` the sheets its host's `data-fud-adopt` names, in that order. */
export function adoptSheets(host: Element, shadow: ShadowRoot): void {
  const specifiers = (host.getAttribute('data-fud-adopt') ?? '').split(' ').filter(Boolean);
  if (specifiers.length === 0) return;
  const adopted: CSSStyleSheet[] = [];
  for (const specifier of specifiers) {
    const sheet = sheetOf(host.ownerDocument, specifier);
    if (sheet !== undefined) adopted.push(sheet);
  }
  shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, ...adopted];
}
