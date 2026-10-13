// @vitest-environment happy-dom
/**
 * An interpolated run the server painted as `''` leaves no node in the HTML: there is nothing
 * to serialize. Hydration looked for it with `lastChild`/`previousSibling`, got `null` or the
 * element beside it, and the first change of the value threw «Cannot set properties of null
 * (setting 'data')». `h()` now puts an empty text node where the run belongs (`textAt`).
 *
 * Proved on the running tree: rendered by SSR with the empty value, mounted as the parser
 * leaves it, adopted with construction forbidden — the run is the only node `h()` may make —
 * and then updated.
 */

import { describe, expect, it } from 'vitest';
import { browserDom } from '@fudic/dom';
import { resolveComponents, type ComponentGraph } from '../../../src/emit/index.js';
import { memoryIo } from '../_support.js';
import { adoptOnly, clientFactory, controller, mountAsDsd, serverShadowHtml } from './_harness.js';

const CODE = '@code {\n  const { a, b, on } = props<{ a: string; b: string; on: boolean }>();\n}\n';

function graph(tag: string, markup: string): ComponentGraph {
  return resolveComponents(
    '/page.fud',
    memoryIo({
      '/page.fud': `<link rel="component" href="./${tag}.fud">\n<html><head></head><body><${tag}></${tag}></body></html>\n`,
      [`/${tag}.fud`]: `${CODE}<${tag}>\n  <template shadowrootmode="open">${markup}</template>\n</${tag}>\n`,
    }),
  );
}

/** Paint with `a = b = ''`, hydrate, then hand it `values`; what the shadow holds at each step. */
function run(tag: string, markup: string, values: readonly unknown[]): { painted: string; updated: string } {
  const g = graph(tag, markup);
  const props = { a: '', b: '', on: false };
  const { shadow } = mountAsDsd(tag, serverShadowHtml(g, tag, props));
  const painted = shadow.innerHTML;
  const ctl = controller(clientFactory(g, tag), adoptOnly(browserDom), shadow, ['', '', false]);
  ctl.h();
  // The update channel is positional over the whole props tuple: `$dom` and `$shadow` first.
  ctl.u([undefined, undefined, ...values]);
  return { painted, updated: shadow.innerHTML };
}

describe('a run the server painted as nothing', () => {
  it('alone in its element: the update writes it', () => {
    const { painted, updated } = run('x-alone', '<span>@a</span>', ['x', '', false]);
    expect(painted).toBe('<span></span>');
    expect(updated).toBe('<span>x</span>');
  });

  it('with an element after it: the text goes before the element, not into it', () => {
    const { painted, updated } = run('x-before', '<p>@a<b></b></p>', ['x', '', false]);
    expect(painted).toBe('<p><b></b></p>');
    expect(updated).toBe('<p>x<b></b></p>');
  });

  it('two of them on either side of a marker: each lands on its side', () => {
    const { painted, updated } = run('x-marker', '<p>@(a)@if (on) {<b>B</b>}@(b)</p>', ['x', 'y', false]);
    expect(painted).toBe('<p><!----></p>');
    expect(updated).toBe('<p>x<!---->y</p>');
  });
});
