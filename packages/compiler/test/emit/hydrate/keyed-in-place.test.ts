// @vitest-environment happy-dom
/**
 * SDD-68 §6, criteria 15 and 16 — a hydrated keyed list that a pass leaves in the same order is
 * left ALONE: not a node taken out and put back.
 *
 * Moving a node in place is not free. A browser drops the focus of anything inside a node it
 * re-inserts, so a pass that re-inserted every row — and a `task` going `pending` runs one —
 * took the focus off the «Activo» the user had just clicked. Two things made it: `move` moved
 * rows already where they go, and it moved the blank run a hydrated row only REFERENCES (the
 * last child of the parent, shared by every row). A reorder must still move what it has to.
 */

import { describe, expect, it } from 'vitest';
import { browserDom } from '@fudic/dom';
import { resolveComponents, type ComponentGraph } from '../../../src/emit/index.js';
import { memoryIo } from '../_support.js';
import { clientFactory, controller, mountAsDsd, serverShadowHtml } from './_harness.js';

const SOURCE =
  '@code {\n' +
  '  const { rows } = props<{ rows: { id: string }[] }>();\n' +
  '}\n' +
  '<x-keyed>\n' +
  '  <template shadowrootmode="open"><ul>\n' +
  '    @foreach (const r of rows) key (r.id) {\n' +
  '      <li>@r.id</li>\n' +
  '    }\n' +
  '  </ul></template>\n' +
  '</x-keyed>\n';

function graph(): ComponentGraph {
  return resolveComponents(
    '/page.fud',
    memoryIo({
      '/page.fud': '<link rel="component" href="./x-keyed.fud">\n<html><head></head><body><x-keyed></x-keyed></body></html>\n',
      '/x-keyed.fud': SOURCE,
    }),
  );
}

const rowsOf = (...ids: string[]): { id: string }[] => ids.map((id) => ({ id }));

function hydrated(ids: string[]) {
  const g = graph();
  const { shadow } = mountAsDsd('x-keyed', serverShadowHtml(g, 'x-keyed', { rows: rowsOf(...ids) }));
  const ctl = controller(clientFactory(g, 'x-keyed'), browserDom, shadow, [rowsOf(...ids)]);
  ctl.h!();
  const ul = shadow.querySelector('ul')!;
  const records: MutationRecord[] = [];
  const observer = new MutationObserver((r) => void records.push(...r));
  observer.observe(ul, { childList: true });
  return {
    ul,
    lis: (): HTMLLIElement[] => [...ul.querySelectorAll('li')],
    update: (...next: string[]): MutationRecord[] => {
      ctl.u!([, , rowsOf(...next)]);
      return observer.takeRecords().concat(records.splice(0));
    },
  };
}

describe('a hydrated keyed list', () => {
  it('a pass with the same keys in the same order touches no node', () => {
    const list = hydrated(['a', 'b', 'c']);
    const before = list.lis();
    const focused = before[1]!;
    focused.tabIndex = 0;
    focused.focus();
    const root = list.ul.getRootNode() as ShadowRoot;
    expect(root.activeElement).toBe(focused);
    expect(list.update('a', 'b', 'c')).toEqual([]);
    expect(list.lis()).toEqual(before);
    expect(root.activeElement).toBe(focused);
  });

  it('a reorder still moves the rows, and keeps them the same nodes', () => {
    const list = hydrated(['a', 'b', 'c']);
    const [a, b, c] = list.lis();
    expect(list.update('c', 'a', 'b').length).toBeGreaterThan(0);
    expect(list.lis()).toEqual([c, a, b]);
    expect(list.lis().map((li) => li.textContent)).toEqual(['c', 'a', 'b']);
  });

  it('a removal takes out only its row; the rest are the same nodes, untouched', () => {
    const list = hydrated(['a', 'b', 'c']);
    const [a, , c] = list.lis();
    const records = list.update('a', 'c');
    expect(list.lis()).toEqual([a, c]);
    // Only what the removed row owned leaves: nothing is added back.
    expect(records.every((r) => r.addedNodes.length === 0)).toBe(true);
  });
});
