/**
 * SDD-61 phase 3, end to end: what the runtime and the emit of the portable view paint on the
 * server, when they hydrate and when they update (criteria 10, 13, 14, 15, 19, 28, 36, 40).
 * Criterion 25 paints a date, and a date is painted with a pipe: it is in the conformance
 * project, whose `"locales"` make one.
 */
import { describe, expect, test } from 'vitest';
import { mount, renderToHtml } from '../src/index.js';
import * as PComputed from './fixtures/p61-computed.fud';
import * as PDefaults from './fixtures/p61-defaults.fud';
import * as PEmpty from './fixtures/p61-empty.fud';
import * as PLiveEmpty from './fixtures/p61-live-empty.fud';
import * as POrden from './fixtures/p61-orden.fud';
import * as PPresence from './fixtures/p61-presence.fud';
import * as PSpread from './fixtures/p61-spread.fud';
import * as PTareas from './fixtures/p61-tareas.fud';

const text = (root: ParentNode, selector: string): string => root.querySelector(selector)!.textContent!;

describe('criterion 10: a default of the view applies when the field is absent, null included', () => {
  const posts = [
    { slug: 'a', author: { name: 'Ana' }, featured: true },
    { slug: 'b', author: { name: 'Luis' }, featured: null },
    { slug: 'c', author: { name: 'Marta' } },
  ];

  test('on the server', async () => {
    const t = await mount(PDefaults, { props: { posts, info: { title: null } } });
    expect([...t.root.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['a Ana yes', 'b Luis no', 'c Marta no']);
    expect(text(t.root, 'h1')).toBe('untitled');
  });

  test('on the client', async () => {
    const t = await mount(PDefaults, { via: 'client', props: { posts, info: { title: null } } });
    expect([...t.root.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['a Ana yes', 'b Luis no', 'c Marta no']);
    expect(text(t.root, 'h1')).toBe('untitled');
  });

  test('a present value still wins', async () => {
    const t = await mount(PDefaults, { props: { info: { title: 'Hola' } } });
    expect(text(t.root, 'h1')).toBe('Hola');
  });
});

describe('criterion 13 (D6): the attributes of a spread, sorted, where the first spread sits', () => {
  const enlace = { href: '/leer', title: 'del enlace', rel: 'next' };

  test('on the server: title from extra when it writes one, from enlace when not', async () => {
    const html = await renderToHtml(PSpread, { props: { enlace, extra: { title: 'del extra', hidden: true } } });
    expect(html).toContain('<a hidden="" href="/leer" rel="next" title="del extra" class="boton">Leer</a>');
    expect(html).toContain('<a id="first" hidden="" title="del extra">Otro</a>');
    const other = await renderToHtml(PSpread, { props: { enlace, extra: { title: null } } });
    expect(other).toContain('<a href="/leer" rel="next" title="del enlace" class="boton">Leer</a>');
  });

  test('an instance the client creates writes the same order', async () => {
    const props = { enlace, extra: { title: 'del extra', hidden: true } };
    const server = await mount(PSpread, { props });
    const client = await mount(PSpread, { via: 'client', props });
    expect(client.root.innerHTML).toBe(server.root.innerHTML);
  });
});

describe('criterion 14: @empty on the server, in the three loops', () => {
  test('zero turns paint the @empty, and only it', async () => {
    const t = await mount(PEmpty);
    expect(t.root.querySelector('ul')!.innerHTML).toBe('<li class="none">none</li>');
    expect(t.root.querySelector('ol')!.innerHTML).toBe('<li class="none">zero</li>');
    expect(t.root.querySelector('p')!.innerHTML).toBe('<i>nothing</i>');
  });

  test('a turn or more paint the rows, and no @empty', async () => {
    const t = await mount(PEmpty, { props: { items: ['x', 'y'], n: 2 } });
    expect(t.root.querySelector('ul')!.innerHTML).toBe('<li>x</li><li>y</li>');
    expect(t.root.querySelector('ol')!.innerHTML).toBe('<li>0</li><li>1</li>');
    expect(t.root.querySelector('p')!.innerHTML).toBe('<b>2</b><b>1</b>');
  });

  test('the client paints the same, zero turns or more', async () => {
    for (const props of [{}, { items: ['x', 'y'], n: 2 }]) {
      const server = await mount(PEmpty, { props });
      const client = await mount(PEmpty, { via: 'client', props });
      expect(client.root.innerHTML).toBe(server.root.innerHTML);
    }
  });
});

describe('criterion 15: @empty live', () => {
  test('emptying the list of a hydrated @foreach mounts @empty, and filling it takes it off', async () => {
    const t = await mount(PLiveEmpty);
    const ul = t.root.querySelector('ul')!;
    expect(ul.innerHTML).toBe('<li>a</li><li>b</li>');
    t.root.querySelector<HTMLButtonElement>('button.clear')!.click();
    await t.settled();
    expect(ul.innerHTML).toBe('<li class="none">none</li>');
    t.root.querySelector<HTMLButtonElement>('button.fill')!.click();
    await t.settled();
    expect(ul.innerHTML).toBe('<li>c</li>');
    // No orphan: what is under the list is the one row, and nothing else.
    expect(ul.childNodes).toHaveLength(1);
    t.root.querySelector<HTMLButtonElement>('button.clear')!.click();
    await t.settled();
    t.root.querySelector<HTMLButtonElement>('button.clear')!.click();
    await t.settled();
    expect(ul.innerHTML).toBe('<li class="none">none</li>');
  });
});

describe('criterion 19: a computed of the cut is evaluated on the server', () => {
  test('computed(() => n() * 2) with n = signal(10) paints 20', async () => {
    const t = await mount(PComputed);
    expect(text(t.root, 'p')).toBe('20');
  });
});

describe('criterion 28: presence', () => {
  test('@if (x === null) with x undefined takes the branch, on the server and on the client', async () => {
    const server = await mount(PPresence);
    expect(text(server.root, 'p')).toBe('absent');
    expect(server.root.querySelector('i')).toBeNull();
    const client = await mount(PPresence, { via: 'client' });
    expect(text(client.root, 'p')).toBe('absent');
    expect(client.root.querySelector('i')).toBeNull();
  });

  test('a present value is present', async () => {
    const t = await mount(PPresence, { props: { x: 'hola' } });
    expect(text(t.root, 'p')).toBe('present');
    expect(text(t.root, 'i')).toBe('there');
  });
});

describe('criterion 36: the tasks', () => {
  const inicial = [
    { id: 1, titulo: 'uno', hecha: true },
    { id: 2, titulo: 'dos', hecha: false },
    { id: 3, titulo: 'tres', hecha: true },
    { id: 4, titulo: 'cuatro', hecha: false },
    { id: 5, titulo: 'cinco', hecha: false },
  ];

  test('the server paints the counts; ticking a pending one recounts without a reload', async () => {
    const t = await mount(PTareas, { props: { inicial } });
    expect(text(t.root, 'p')).toBe('Hechas: 2 · Pendientes: 3');
    const pending = t.root.querySelectorAll('input')[1]!;
    pending.click();
    await t.settled();
    expect(text(t.root, 'p')).toBe('Hechas: 3 · Pendientes: 2');
  });

  test('no task paints its @empty', async () => {
    const t = await mount(PTareas);
    expect(t.root.innerHTML).toContain('No hay tareas.');
  });
});

describe('criterion 40: order and text', () => {
  const xs = [
    { n: 'c', p: 2 },
    { n: 'a', p: 1 },
    { n: 'd', p: 2 },
    { n: 'b', p: 1 },
  ];

  for (const via of ['ssr', 'client'] as const) {
    test(`toSorted is stable and leaves the list as it was; UTF-16 text (${via})`, async () => {
      const t = await mount(POrden, { via, props: { xs } });
      expect(text(t.root, '.sorted')).toBe('a,b,c,d');
      expect(text(t.root, '.original')).toBe('c,a,d,b');
      // A comparator that gives NaN counts as 0: the order they came in.
      expect(text(t.root, '.nan')).toBe('c,a,d,b');
      expect(text(t.root, '.utf16')).toBe('true');
      expect(text(t.root, '.length')).toBe('2');
    });
  }
});
