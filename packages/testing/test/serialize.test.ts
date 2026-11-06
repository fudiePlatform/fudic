/**
 * A painted piece back to markup (SDD-78 criteria 2 and 6): every shadow root written as the
 * declarative one it came from, with its adopted sheets inline, and nothing that runs or that
 * only the hydration reads.
 */

import { afterEach, describe, expect, test } from 'vitest';
import { sourceOf } from '../src/dsd.js';
import { elementOf, previewDocument, serialize } from '../src/serialize.js';

afterEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

/** A host with an open shadow root holding `inner`, and the sheets it adopted. */
function host(inner: string, sheets: readonly CSSStyleSheet[] = []): HTMLElement {
  const el = document.createElement('x-host');
  const shadow = el.attachShadow({ mode: 'open' });
  shadow.adoptedStyleSheets = [...sheets];
  shadow.innerHTML = inner;
  return el;
}

function sheet(css: string, source?: string): CSSStyleSheet {
  const made = new CSSStyleSheet();
  made.replaceSync(css);
  if (source !== undefined) sourceOf.set(made, source);
  return made;
}

describe('an element and its shadow root', () => {
  test('the shadow root as a declarative template, first, then the light children', () => {
    const el = host('<p>inside</p>');
    el.innerHTML = '<span>light</span>';
    expect(elementOf(el)).toBe('<x-host><template shadowrootmode="open"><p>inside</p></template><span>light</span></x-host>');
  });

  test('its adopted sheets as <style>: the text they were made from, or else rule by rule', () => {
    const nested = '.a { & b { margin: 0; } }';
    const el = host('<p>x</p>', [sheet('p { color: red; }'), sheet(nested, nested)]);
    const html = elementOf(el);
    expect(html).toMatch(/^<x-host><template shadowrootmode="open"><style>p \{\s*color: red;\s*\}<\/style>/u);
    expect(html).toContain(`<style>${nested}</style><p>x</p>`);
  });

  test('text and attributes escaped; the text of a <style> left as CSS', () => {
    const el = host('lead <p title="a &quot;b&quot; &amp; c">1 &lt; 2 &amp; 3 &gt; 0</p><style>a > b { c: d }</style>');
    expect(elementOf(el)).toBe(
      '<x-host><template shadowrootmode="open">lead <p title="a &quot;b&quot; &amp; c">1 &lt; 2 &amp; 3 &gt; 0</p>' +
        '<style>a > b { c: d }</style></template></x-host>',
    );
  });

  test('no script and no comment; void elements with no end tag; a template by its content', () => {
    const el = host('<!-- marker --><br><img src="x.png" alt="x"><input value="v"><script>alert(1)</script><template><i>later</i></template>');
    expect(elementOf(el)).toBe(
      '<x-host><template shadowrootmode="open"><br><img src="x.png" alt="x"><input value="v"><template><i>later</i></template></template></x-host>',
    );
  });

  test('a script is nothing even as the element asked for', () => {
    expect(elementOf(document.createElement('script'))).toBe('');
  });
});

describe('serialize', () => {
  test('a component is itself', () => {
    const el = host('<p>x</p>');
    expect(serialize(el)).toBe(elementOf(el));
  });

  test('a page is the children of its <body>', () => {
    document.body.innerHTML = '<main><h1>Hi</h1></main><script>1</script>';
    expect(serialize(document.body)).toBe('<main><h1>Hi</h1></main>');
  });
});

describe('the preview document', () => {
  test('the <style> of the head inline, and nothing else of it', () => {
    document.head.innerHTML = '<meta name="x"><script>run()</script><style type="module" specifier="panel">.panel{display:flex;}</style><style>p{margin:0}</style>';
    expect(previewDocument(document, '<p>x</p>')).toBe(
      '<!doctype html><html><head><meta charset="utf-8"><style>.panel{display:flex;}</style><style>p{margin:0}</style></head><body><p>x</p></body></html>',
    );
  });

  test('a head with no sheet', () => {
    expect(previewDocument(document, '')).toBe('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');
  });
});
