/**
 * `jsonBlock` / `escapeJson` — the `<script type="application/json">` a page publishes for
 * the hydration runtime (SDD-15 §3.3–§3.5).
 *
 * The subject is the one bug these blocks can have: `script` is rawtext, so its text is
 * serialized VERBATIM and a `</script` inside the payload would close the block and turn the
 * rest into markup.
 */
import { describe, expect, it } from 'vitest';
import { SsrDom } from '../src/ssr-dom.js';
import { renderToString } from '../src/serialize.js';
import { escapeJson, jsonBlock } from '../src/json-block.js';

describe('escapeJson', () => {
  it('leaves an ordinary payload untouched', () => {
    expect(escapeJson('[[0,1],["hola"]]')).toBe('[[0,1],["hola"]]');
  });

  it('escapes every `<`, which is what neutralizes the three script sequences', () => {
    expect(escapeJson('"</script>"')).toBe('"\\u003c/script>"');
    expect(escapeJson('"<!--"')).toBe('"\\u003c!--"');
    expect(escapeJson('"<script"')).toBe('"\\u003cscript"');
  });

  it('escapes U+2028 and U+2029, JSON-legal and JS line terminators', () => {
    expect(escapeJson('"\u2028\u2029"')).toBe('"\\u2028\\u2029"');
  });

  it('the escape is a JSON escape, so the value survives the round trip', () => {
    const value = ['</script><img src=x onerror="alert(1)">', 'a\u2028b'];
    expect(JSON.parse(escapeJson(JSON.stringify(value)))).toEqual(value);
  });
});

describe('jsonBlock', () => {
  it('appends a typed, identified script holding the value', () => {
    const dom = new SsrDom();
    const body = dom.element('body');
    jsonBlock(dom, body, 'fud-tree', { 'app-card': ['app-button'] });
    expect(renderToString(body)).toBe(
      '<body><script type="application/json" id="fud-tree">{"app-card":["app-button"]}</script></body>',
    );
  });

  it('a hostile string cannot close the block', () => {
    const dom = new SsrDom();
    const body = dom.element('body');
    jsonBlock(dom, body, 'fud-state', [[0, 1], ['</script><img src=x>']]);
    const html = renderToString(body);
    expect(html.match(/<\/script>/gu)).toHaveLength(1);
    const text = /id="fud-state">(.*?)<\/script>/su.exec(html)![1]!;
    expect(JSON.parse(text)).toEqual([[0, 1], ['</script><img src=x>']]);
  });
});
