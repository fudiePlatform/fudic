import { describe, it, expect } from 'vitest';
import { type Dom, browserDom } from '@fudic/dom';
import { SsrDom } from '../src/ssr-dom.js';
import { renderToString } from '../src/serialize.js';

/**
 * The heart of "one construction, two adapters" (SDD-14 §6.5): a single build
 * body, written against the shared `Dom<N>` contract, produces equivalent output
 * on `browserDom` (live DOM) and `SsrDom` (serialized string).
 */
function build<N>(d: Dom<N>): N {
  const div = d.element('div');
  d.setAttr(div, 'class', 'x');
  const span = d.element('span');
  d.append(span, d.text('hi'));
  d.append(div, span);
  return div;
}

describe('construction isomorphism', () => {
  it('browserDom and SsrDom render the same markup', () => {
    const browserOut = (build(browserDom) as Element).outerHTML;
    const ssrOut = renderToString(build(new SsrDom()));
    expect(ssrOut).toBe('<div class="x"><span>hi</span></div>');
    expect(browserOut).toBe(ssrOut);
  });
});

/**
 * The URL guard on both sides (SDD-51 §3.7, criterion 16): the server paints the attribute and
 * the browser adopts it, so the two must write the same string — inert or not.
 */
describe('setUrl isomorphism', () => {
  const link = <N>(d: Dom<N>, url: unknown): N => {
    const a = d.element('a');
    d.setUrl(a, 'href', url);
    return a;
  };

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:x',
    '  javascript:x',
    'java\tscript:x',
    'vbscript:x',
    '//evil.example/x',
    'https://a.b',
    'mailto:a@b',
    '/x',
    'x/y',
  ])('writes %j the same on the server and in the browser', (url) => {
    const browserOut = (link(browserDom, url) as Element).outerHTML;
    const ssrOut = renderToString(link(new SsrDom(), url));
    expect(browserOut).toBe(ssrOut);
  });
});
