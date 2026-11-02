// @vitest-environment happy-dom
/**
 * SDD-74 §4.4, criteria 8 and 9 — `checked`, `value` and `selected` follow the view.
 *
 * A control is the one node the user writes to: ticking a box moves its `checked` PROPERTY, and
 * an attribute written over it no longer moves it. So the component is compiled, rendered by
 * SSR, mounted as the parser leaves it and hydrated; the test then does what the user does —
 * sets the property by hand — and fires a pass with a signal the view reads that has nothing to
 * do with the control. The control must go back to what its own signal says, which never moved.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { FudicElement, owned, signal, subscribe, written } from '@fudic/core';
import {
  emitComponentClientModule,
  emitComponentModule,
  resolveComponents,
  type ComponentGraph,
} from '../../../src/emit/index.js';
import { memoryIo } from '../_support.js';
import { mountAsDsd, serverShadowHtml } from './_harness.js';

/** Every live property with `=@expr`, and `tick`: a signal the view reads, to cause a pass. */
const LIVE =
  '@code {\n' +
  "  import { signal } from '@fudic/core';\n" +
  '\n' +
  '  const on = signal(false);\n' +
  "  const name = signal('Ana');\n" +
  '  const pick = signal(true);\n' +
  '  const tick = signal(0);\n' +
  '\n' +
  "  document.addEventListener('lp-tick', () => tick.set(tick() + 1));\n" +
  "  document.addEventListener('lp-on', () => on.set(!on()));\n" +
  '}\n' +
  '\n' +
  '<x-live>\n' +
  '  <template shadowrootmode="open">' +
  '<input class="box" type="checkbox" checked=@on()>' +
  '<input class="name" value=@name()>' +
  '<textarea class="note" value=@name()></textarea>' +
  '<select class="pick"><option value="a">a</option><option class="b" value="b" selected=@pick()>b</option></select>' +
  '<span class="tick">@tick()</span>' +
  '</template>\n' +
  '</x-live>\n';

/** The same controls in the rows of a `@foreach`, keyed: a row whose item did not change. */
const ROWS =
  '@code {\n' +
  "  import { signal } from '@fudic/core';\n" +
  '\n' +
  "  const people = signal([{ id: 1, active: true }, { id: 2, active: false }]);\n" +
  '  const tick = signal(0);\n' +
  '\n' +
  "  document.addEventListener('lp-tick', () => tick.set(tick() + 1));\n" +
  '}\n' +
  '\n' +
  '<x-rows>\n' +
  '  <template shadowrootmode="open">' +
  '<span class="tick">@tick()</span>' +
  '<ul>@foreach (const p of people()) key (p.id) {<li><input type="checkbox" checked=@p.active></li>}</ul>' +
  '</template>\n' +
  '</x-rows>\n';

const graph: ComponentGraph = resolveComponents(
  '/page.fud',
  memoryIo({
    '/page.fud':
      '<link rel="component" href="./x-live.fud">\n' +
      '<link rel="component" href="./x-rows.fud">\n' +
      '<html><head></head><body><x-live></x-live><x-rows></x-rows></body></html>\n',
    '/x-live.fud': LIVE,
    '/x-rows.fud': ROWS,
  }),
);

beforeAll(() => {
  for (const tag of ['x-live', 'x-rows']) {
    const body = emitComponentClientModule(graph, graph.components.get(tag)!).replace(/^import .*$/gmu, '');    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    new Function('FudicElement', 'signal', '$sub', '$written', '$owned', body)(FudicElement, signal, subscribe, written, owned);
  }
});

const fire = (name: string): void => {
  document.dispatchEvent(new Event(name));
};

/** The page as the parser leaves it, hydrated. */
function hydrated(tag: string): { host: FudicElement; shadow: ShadowRoot } {
  const { host, shadow } = mountAsDsd(tag, serverShadowHtml(graph, tag, {}));
  (host as FudicElement).h([]);
  return { host: host as FudicElement, shadow };
}

describe('criterion 8: the view puts back what the user moved', () => {
  it('a checkbox with checked=@x() and x false: ticked by the user, a pass unticks it', () => {
    const { host, shadow } = hydrated('x-live');
    const box = shadow.querySelector<HTMLInputElement>('.box')!;
    expect(box.checked).toBe(false);

    box.checked = true; // the user ticks it
    fire('lp-tick');
    expect(shadow.querySelector('.tick')!.textContent).toBe('1'); // a pass ran
    expect(box.checked).toBe(false);
    host.remove();
  });

  it('the signal moving still moves the box, both ways', () => {
    const { host, shadow } = hydrated('x-live');
    const box = shadow.querySelector<HTMLInputElement>('.box')!;
    fire('lp-on');
    expect(box.checked).toBe(true);
    box.checked = false; // the user unticks it
    fire('lp-tick');
    expect(box.checked).toBe(true);
    fire('lp-on');
    expect(box.checked).toBe(false);
    host.remove();
  });

  it('value on an <input>: what the user typed goes back to the signal', () => {
    const { host, shadow } = hydrated('x-live');
    const input = shadow.querySelector<HTMLInputElement>('.name')!;
    expect(input.value).toBe('Ana');
    input.value = 'Anabel';
    fire('lp-tick');
    expect(input.value).toBe('Ana');
    host.remove();
  });

  it('value on a <textarea>: the same', () => {
    const { host, shadow } = hydrated('x-live');
    const note = shadow.querySelector<HTMLTextAreaElement>('.note')!;
    // A <textarea> takes no `value` attribute: what the server paints only shows after a pass.
    note.value = 'otra cosa';
    fire('lp-tick');
    expect(note.value).toBe('Ana');
    host.remove();
  });

  it('selected on an <option>: what the user picked goes back to the signal', () => {
    const { host, shadow } = hydrated('x-live');
    const select = shadow.querySelector<HTMLSelectElement>('.pick')!;
    const b = shadow.querySelector<HTMLOptionElement>('.b')!;
    expect(b.selected).toBe(true);
    select.value = 'a'; // the user picks a
    expect(b.selected).toBe(false);
    fire('lp-tick');
    expect(b.selected).toBe(true);
    expect(select.value).toBe('b');
    host.remove();
  });

  it('hydration writes nothing over what the server painted', () => {
    const { host, shadow } = mountAsDsd('x-live', serverShadowHtml(graph, 'x-live', {}));
    const before = shadow.innerHTML;
    (host as FudicElement).h([]);
    expect(shadow.innerHTML).toBe(before);
    host.remove();
  });

  it('in a keyed @foreach, a row whose item did not change goes back too', () => {
    const { host, shadow } = hydrated('x-rows');
    const boxes = [...shadow.querySelectorAll<HTMLInputElement>('li input')];
    expect(boxes.map((b) => b.checked)).toEqual([true, false]);
    boxes[0]!.checked = false;
    boxes[1]!.checked = true;
    fire('lp-tick');
    expect(shadow.querySelector('.tick')!.textContent).toBe('1');
    expect(boxes.map((b) => b.checked)).toEqual([true, false]);
    host.remove();
  });
});

describe('criterion 9: the server still paints the attribute', () => {
  it('the HTML of the four controls is the attribute an interpolated value always wrote', () => {
    expect(serverShadowHtml(graph, 'x-live', {})).toBe(
      '<input type="checkbox" class="box">' +
        '<input value="Ana" class="name">' +
        '<textarea value="Ana" class="note"></textarea>' +
        '<select class="pick"><option value="a">a</option><option value="b" selected="" class="b">b</option></select>' +
        '<span class="tick">0</span>',
    );
  });

  it('the server module never writes a property: no setLive in it', () => {
    for (const tag of ['x-live', 'x-rows']) {
      expect(emitComponentModule(graph, graph.components.get(tag)!)).not.toContain('setLive');
    }
  });

  it('a live property is the same server output as the same attribute where it is not live', () => {
    const plain = resolveComponents(
      '/page.fud',
      memoryIo({
        '/page.fud': '<link rel="component" href="./x-plain.fud">\n<html><head></head><body><x-plain></x-plain></body></html>\n',
        // `checked` on a <div> and `selected` on a <span> are plain attributes, never live.
        '/x-plain.fud':
          "@code {\n  import { signal } from '@fudic/core';\n  const on = signal(true);\n  const off = signal(false);\n}\n\n" +
          '<x-plain>\n  <template shadowrootmode="open"><div checked=@on()></div><div checked=@off()></div><span selected=@on()></span></template>\n</x-plain>\n',
      }),
    );
    expect(serverShadowHtml(plain, 'x-plain', {})).toBe('<div checked=""></div><div></div><span selected=""></span>');
  });
});
