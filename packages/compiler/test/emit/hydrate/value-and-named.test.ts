// @vitest-environment happy-dom
/**
 * SDD-80 §3.5, §3.6 and criteria 17–19, 24–25, dispatched for real: `$value` reads the control
 * with the reader `control=` binds with, delegated or not, and two `click`s of one row go each to
 * its own named handler, with one listener per handler whatever the number of rows.
 */

import { describe, expect, it } from 'vitest';
import { browserDom, type Dom } from '@fudic/dom';
import { emitComponentClientModule, resolveComponents, type ComponentGraph } from '../../../src/emit/index.js';
import { memoryIo } from '../_support.js';
import { clientFactory, controller } from './_harness.js';

function graphOf(tag: string, component: string): ComponentGraph {
  return resolveComponents(
    '/page.fud',
    memoryIo({
      '/page.fud': `<link rel="component" href="./${tag}.fud">\n<html><head></head><body><${tag}></${tag}></body></html>\n`,
      [`/${tag}.fud`]: component,
    }),
  );
}

/** A component of `markup`, whose handlers push what they receive to the log. */
const componentOf = (tag: string, markup: string, props = ''): string =>
  '@code {\n' +
  `${props}` +
  '  globalThis.__fudLog = [];\n' +
  '  function f(...args) { globalThis.__fudLog.push(args); }\n' +
  '  function activar(...args) { globalThis.__fudLog.push(["activar", ...args]); }\n' +
  '  function borrar(...args) { globalThis.__fudLog.push(["borrar", ...args]); }\n' +
  '  function ver(...args) { globalThis.__fudLog.push(["ver", ...args]); }\n' +
  '}\n' +
  `<${tag}>\n  <template shadowrootmode="open">${markup}</template>\n</${tag}>\n`;

const log = (): unknown[][] => (globalThis as unknown as { __fudLog: unknown[][] }).__fudLog;

let n = 0;

/** A created instance; `args` is the payload channel. */
function mount(markup: string, args: readonly unknown[] = [], props = '', dom: Dom<Node> = browserDom) {
  const tag = `x-v${(n += 1)}`;
  const graph = graphOf(tag, componentOf(tag, markup, props));
  const host = document.createElement(tag);
  const shadow = host.attachShadow({ mode: 'open' });
  document.body.append(host);
  const ctl = controller(clientFactory(graph, tag), dom, shadow, args);
  ctl.c();
  return { shadow, client: emitComponentClientModule(graph, graph.components.get(tag)!) };
}

const fire = (el: Element, type: string): void => {
  el.dispatchEvent(new Event(type, { bubbles: true, composed: true }));
};

describe('$value without delegation (criteria 17, 18)', () => {
  it('a checkbox: the reader is written in line, and the handler gets a boolean', () => {
    const { shadow, client } = mount('<input type="checkbox" @change=@f($value)>');
    expect(client).toContain('($event) => { const $value = $event.currentTarget.checked; return f($value); }');
    const box = shadow.querySelector('input') as HTMLInputElement;
    box.checked = true;
    fire(box, 'change');
    box.checked = false;
    fire(box, 'change');
    expect(log()).toEqual([[true], [false]]);
  });

  it.each([
    ['<input type="radio" value="a" @change=@f($value)>', (el: HTMLInputElement) => void (el.checked = true), 'a'],
    ['<input type="number" @input=@f($value)>', (el: HTMLInputElement) => void (el.value = '42'), 42],
    ['<input type="number" @input=@f($value)>', (el: HTMLInputElement) => void (el.value = ''), null],
    ['<input type="range" @input=@f($value)>', (el: HTMLInputElement) => void (el.value = '7'), 7],
    ['<input type="text" @input=@f($value)>', (el: HTMLInputElement) => void (el.value = 'hola'), 'hola'],
    ['<input @input=@f($value)>', (el: HTMLInputElement) => void (el.value = 'sin tipo'), 'sin tipo'],
    ['<input type="email" @blur=@f($value)>', (el: HTMLInputElement) => void (el.value = 'a@b.es'), 'a@b.es'],
    ['<textarea @input=@f($value)></textarea>', (el: HTMLTextAreaElement) => void (el.value = 'largo'), 'largo'],
  ] as const)('%s', (markup, set, expected) => {
    const { shadow } = mount(markup);
    const el = shadow.firstElementChild as HTMLInputElement;
    set(el as never);
    const type = /@(\w+)=/u.exec(markup)![1]!;
    fire(el, type);
    expect(log()).toEqual([[expected]]);
  });

  it('a file input gives its files as an array, empty with none', () => {
    const { shadow, client } = mount('<input type="file" @change=@f($value)>');
    expect(client).toContain('Array.from($event.currentTarget.files ?? [])');
    fire(shadow.querySelector('input')!, 'change');
    expect(log()).toEqual([[[]]]);
  });

  it('a select gives its value; a select multiple, the values of its selected options', () => {
    const single = mount('<select @change=@f($value)><option value="a">A</option><option value="b">B</option></select>');
    const s = single.shadow.querySelector('select') as HTMLSelectElement;
    s.value = 'b';
    fire(s, 'change');
    expect(log()).toEqual([['b']]);

    const multi = mount('<select multiple @change=@f($value)><option value="a">A</option><option value="b">B</option><option value="c">C</option></select>');
    const m = multi.shadow.querySelector('select') as HTMLSelectElement;
    m.options[0]!.selected = true;
    m.options[2]!.selected = true;
    fire(m, 'change');
    expect(log()).toEqual([[['a', 'c']]]);
  });

  it('$value beside $event and other arguments, in any order', () => {
    const { shadow } = mount('<input type="checkbox" @change=@f(1, $value, $event.type)>');
    fire(shadow.querySelector('input')!, 'change');
    expect(log()).toEqual([[1, false, 'change']]);
  });

  it('a handler that does not mention $value is written as before', () => {
    const { client } = mount('<input type="checkbox" @change=@f($event)>');
    expect(client).not.toContain('$value');
  });
});

/** The table of SDD-80 §1: a checkbox, Borrar and Ver per row, delegated to the `<tbody>`. */
const TABLE =
  '<table><tbody @change=@activar(p, $value) @click.borrar=@borrar(p) @click.ver=@ver(p)>\n' +
  '  @foreach (const p of personas) key (p.id) {\n' +
  '    <tr class="r-@p.id">\n' +
  '      <td><input type="checkbox" checked=@p.active delegate:p="change"></td>\n' +
  '      <td><button class="borrar" delegate:p="click.borrar">Borrar</button></td>\n' +
  '      <td><button class="ver" delegate:p="click.ver">Ver <b>!</b></button></td>\n' +
  '    </tr>\n' +
  '  }\n' +
  '</tbody></table>';

const PROPS = '  const { personas = [] } = props<{ personas?: { id: number; active: boolean }[] }>();\n';

const people = (count: number) => Array.from({ length: count }, (_, i) => ({ id: i + 1, active: i % 2 === 0 }));

/** `browserDom` with every `event()` counted, by type. */
function counting(): { dom: Dom<Node>; types: string[] } {
  const seen = { dom: browserDom as Dom<Node>, types: [] as string[] };
  seen.dom = {
    ...browserDom,
    event: (node: Node, type: string, cb: (e: Event) => void) => {
      seen.types.push(type);
      return browserDom.event(node, type, cb);
    },
  } as Dom<Node>;
  return seen;
}

describe('the delegated table (criteria 19, 24, 25)', () => {
  it('activar gets the row and the checked of ITS checkbox', () => {
    const rows = people(3);
    const { shadow, client } = mount(TABLE, [rows], PROPS);
    expect(client).toContain('const $value = $x.checked;');
    const box = shadow.querySelector('.r-2 input') as HTMLInputElement;
    box.checked = true;
    fire(box, 'change');
    expect(log()).toEqual([['activar', rows[1], true]]);
  });

  it('Ver calls only ver, Borrar only borrar, the checkbox only activar', () => {
    const rows = people(2);
    const { shadow } = mount(TABLE, [rows], PROPS);
    fire(shadow.querySelector('.r-1 .ver b')!, 'click');
    expect(log()).toEqual([['ver', rows[0]]]);
    fire(shadow.querySelector('.r-2 .borrar')!, 'click');
    expect(log()).toEqual([['ver', rows[0]], ['borrar', rows[1]]]);
    // A click on the checkbox is a `click` no named handler is served by: only its `change` counts.
    const box = shadow.querySelector('.r-1 input') as HTMLInputElement;
    fire(box, 'click');
    fire(box, 'change');
    expect(log().map((e) => e[0])).toEqual(['ver', 'borrar', 'activar']);
  });

  it.each([1, 50])('the <tbody> has three listeners — change, click, click — with %i rows', (count) => {
    const spy = counting();
    mount(TABLE, [people(count)], PROPS, spy.dom);
    expect(spy.types.sort()).toEqual(['change', 'click', 'click']);
  });

  it('$value reads the marked element, not the target: a click on a child of it', () => {
    const markup =
      '<ul @click=@f(p, $value)>\n' +
      '  @foreach (const p of items) key (p) {\n' +
      '    <li><input type="checkbox" class="c-@p" delegate:p></li>\n' +
      '  }\n' +
      '</ul>';
    const { shadow } = mount(markup, [['a', 'b']], '  const { items = [] } = props<{ items?: string[] }>();\n');
    const box = shadow.querySelector('.c-b') as HTMLInputElement;
    box.checked = true;
    fire(box, 'click');
    // A click outside every row calls nothing.
    fire(shadow.querySelector('ul')!, 'click');
    expect(log()).toEqual([['b', true]]);
  });
});
