// @vitest-environment happy-dom
/**
 * SDD-30 §3.4 — where a block PUTS what it built, on a real DOM.
 *
 * The rest of the block emit is asserted on its text, and rightly so. This one cannot be:
 * the anchor of a block is a variable of the walk, and whether it holds a node by the time
 * the block is mounted is a question about the ORDER two emitted statements run in. Both
 * statements look correct on their own; only running them tells.
 *
 * The shape that decides it is a block at the ROOT level with a sibling behind it. There
 * the mount is deferred to `$m`, and the anchor is a node the walk assigns further down —
 * so a block that read it while `c` ran would be inserting before `undefined`.
 */

import { describe, expect, it } from 'vitest';
import { browserDom } from '@fudic/dom';
import { resolveComponents, type ComponentGraph } from '../../../src/emit/index.js';
import { memoryIo } from '../_support.js';
import { clientFactory, controller } from './_harness.js';

const ROWS =
  '@code {\n' +
  '  const { rows } = props<{ rows: string[] }>();\n' +
  '}\n' +
  '<x-mount>\n' +
  '  <template shadowrootmode="open">' +
  '@foreach (const r of rows) key (r) {<p>@r</p>}<hr>' +
  '</template>\n' +
  '</x-mount>\n';

function graphOf(tag: string, source: string): ComponentGraph {
  const io = memoryIo({
    '/page.fud': `<link rel="component" href="./${tag}.fud">\n<html><head></head><body><${tag}></${tag}></body></html>\n`,
    [`/${tag}.fud`]: source,
  });
  return resolveComponents('/page.fud', io);
}

function created(rows: readonly string[]): ShadowRoot {
  const graph = graphOf('x-mount', ROWS);
  const host = document.createElement('x-mount');
  const shadow = host.attachShadow({ mode: 'open' });
  document.body.append(host);
  controller(clientFactory(graph, 'x-mount'), browserDom, shadow, [rows]).c();
  return shadow;
}

describe('a block at the root level, mounted by $m', () => {
  it('puts its rows in order, ahead of the sibling that anchors them', () => {
    expect(created(['a', 'b']).innerHTML).toBe('<p>a</p><p>b</p><hr>');
  });

  it('leaves the sibling alone when the loop renders nothing', () => {
    expect(created([]).innerHTML).toBe('<hr>');
  });
});
