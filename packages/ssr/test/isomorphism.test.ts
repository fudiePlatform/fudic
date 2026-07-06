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
