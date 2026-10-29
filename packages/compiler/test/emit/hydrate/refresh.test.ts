// @vitest-environment happy-dom
/**
 * SDD-68 §6, criteria 15–17 — a mutation repaints the route with its new `data`, without
 * reloading the document.
 *
 * The route is `usuarios` in miniature: a table of `data.users` keyed by `p.id`, a checkbox that
 * saves and a button that removes, each through a `task`. It is rendered on the server, adopted
 * in the browser, and driven by clicks. What is real: the emitted chunk, `task`, and the
 * listener `onStaleData` of `@fudic/core`. What stands in, because this package does not depend
 * on `@fudic/http` (whose own suite covers them): the stub's notice after a call — dispatched
 * here exactly as `announceStale` does — and `load.fetch`, which asks a fake endpoint.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as core from '@fudic/core';
import type { Callable, Controller } from '@fudic/core';
import { browserDom } from '@fudic/dom';
import { resolveDocument } from '../../../src/emit/resolve.js';
import { emitLayoutModule, emitRouteClientModule, emitRouteModule, resolveComponents } from '../../../src/emit/index.js';
import { loadImport } from '../../../src/emit/api-links.js';
import type { LinkedApi } from '../../../src/types/io.js';
import { memoryIo, ssrIo } from '../_support.js';

/** `DATA_STALE_EVENT` of `@fudic/conventions`, which owns the name. */
const DATA_STALE_EVENT = 'fudic:data-stale';

interface User {
  readonly id: number;
  readonly name: string;
  readonly active: boolean;
}

const LAYOUT = '<!DOCTYPE html><html><head>@RenderHead()</head><body><main>@RenderBody()</main></body></html>';
const ROUTE = [
  '<link rel="layout" href="./l.fud">',
  '<link rel="server" href="./usuarios.fudapi">',
  '@code {',
  '  import { task } from "@fudic/core";',
  '  const guardar = task(save);',
  '  const borrar = task(remove);',
  '  function activar(id, e) { probe.run = guardar.run({ id, active: e.target.checked }); }',
  '  function quitar(id) { probe.run = borrar.run({ id }); }',
  '}',
  '<input class="otro" type="search">',
  '<table><tbody>',
  '@foreach (const p of data.users) key (p.id) {',
  '<tr data-id=@p.id><td>@p.name</td>' +
    '<td><input type="checkbox" checked=@p.active @change=@activar(p.id, $event)></td>' +
    '<td><button @click=@quitar(p.id)>Borrar</button></td></tr>',
  '}',
  '</tbody></table>',
].join('\n');

const API: LinkedApi = {
  id: 'routes/usuarios',
  load: true,
  paths: false,
  layout: false,
  functions: ['save', 'remove', 'probe'],
  forms: [],
  route: '/usuarios.fud',
};

const IMPORT = /^import \{([^}]*)\} from (['"])([^'"]+)\2;$/gmu;

function bindImports(source: string, modules: Readonly<Record<string, Record<string, unknown>>>): string {
  return source.replace(IMPORT, (_all, names: string, _q: string, spec: string) => {
    if (!(spec in modules)) throw new Error(`no module for ${spec}`);
    return `const {${names.replace(/\bas\b/gu, ':')}} = $m[${JSON.stringify(spec)}];`;
  });
}

/** The server's table, which a call changes and the endpoint reads back. */
let db: User[];
/** What the fake data endpoint was asked, and how it answers. */
let asked: string[];
let endpointFails: boolean;
let reload: ReturnType<typeof vi.fn>;

/**
 * A server function as its stub behaves after SDD-68: the server applies the call, then — the
 * page being among what a PUT or DELETE invalidates — `DATA_STALE_EVENT` goes out on `document`
 * and the call resolves only after what the listeners handed over with `wait`.
 */
function stubOf<A>(method: string, apply: (args: A) => void): Callable<A, null> {
  const call = async (args: A): Promise<null> => {
    await Promise.resolve(); // the round trip
    apply(args);
    const waits: Promise<void>[] = [];
    const detail = { paths: [location.pathname], wait: (done: Promise<void>) => void waits.push(done) };
    document.dispatchEvent(new CustomEvent(DATA_STALE_EVENT, { detail }));
    await Promise.all(waits);
    return null;
  };
  return Object.assign(call, { method });
}

/** `load.fetch` of the route's browser module: it asks the endpoint for the `data` of `path`. */
const load = {
  fetch: async (path: string): Promise<{ users: User[] }> => {
    asked.push(path);
    await Promise.resolve();
    if (endpointFails) throw new Error(`fudic: the data of ${path} answered 500`);
    return { users: db.map((u) => ({ ...u })) };
  },
};

const probe: { run?: Promise<unknown> } = {};

function hydrated(route = ROUTE): Controller {
  const graph = resolveDocument(
    '/usuarios.fud',
    { ...memoryIo({ '/usuarios.fud': route, '/l.fud': LAYOUT }), api: (path) => (path === '/usuarios.fudapi' ? API : undefined) },
  ).value;
  const modules = {
    '@fudic/core': core,
    'fudic:routes/usuarios': {
      save: stubOf<{ id: number; active: boolean }>('PUT', ({ id, active }) => {
        db = db.map((u) => (u.id === id ? { ...u, active } : u));
      }),
      remove: stubOf<{ id: number }>('DELETE', ({ id }) => {
        db = db.filter((u) => u.id !== id);
      }),
      probe,
      load,
    },
  };

  const layoutSource = emitLayoutModule(graph, graph.layouts[0]!).replace(/^export\s+/gmu, '');
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const layout = new Function(`${layoutSource}\nreturn layout;`)() as unknown;
  const routeSource = bindImports(
    emitRouteModule(graph).replace(/^import \{ layout \} from '\.\/l\.mjs';$/mu, ''),
    modules,
  ).replace(/^export\s+/gmu, '');
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const page = new Function('$m', 'layout', `${routeSource}\nreturn page;`)(modules, layout) as (
    data: unknown,
    io: unknown,
  ) => Iterable<string>;
  const data = { users: db.map((u) => ({ ...u })) };
  const html = [...page(data, ssrIo().io)].join('');
  document.body.innerHTML = html.slice(html.indexOf('>', html.indexOf('<body')) + 1, html.lastIndexOf('</body>'));

  const chunk = emitRouteClientModule(graph)!;
  expect(chunk).toContain('let data = $data;');
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const factory = new Function('$m', bindImports(chunk, modules).replace(/^export default /mu, 'return '))(modules) as (
    props: readonly unknown[],
  ) => Controller;
  const controller = factory([browserDom, document.body, data]);
  controller.h!();
  return controller;
}

const rows = (): HTMLTableRowElement[] => [...document.querySelectorAll('tbody tr')] as HTMLTableRowElement[];
const box = (id: number): HTMLInputElement =>
  document.querySelector(`tr[data-id="${id}"] input[type="checkbox"]`) as HTMLInputElement;

let controller: Controller | undefined;

beforeEach(() => {
  db = [
    { id: 1, name: 'Ana', active: true },
    { id: 2, name: 'Eva', active: true },
    { id: 3, name: 'Leo', active: false },
  ];
  asked = [];
  endpointFails = false;
  reload = vi.fn();
  vi.stubGlobal('location', { ...location, pathname: '/usuarios', reload });
  delete probe.run;
});
afterEach(() => {
  controller?.r();
  controller = undefined;
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('a mutation repaints the route (§4.8)', () => {
  it('15. unticking «Activo» saves, asks for the data once, and updates the row in place', async () => {
    controller = hydrated();
    const search = document.querySelector('input.otro') as HTMLInputElement;
    search.focus();
    search.value = 'a medio escribir';
    const before = rows();

    const ana = box(1);
    ana.checked = false;
    ana.dispatchEvent(new Event('change', { bubbles: true }));
    const order: string[] = [];
    void probe.run!.then(() => order.push(`resolved:${String(box(1).checked)}:${asked.length}`));
    await probe.run;

    expect(db.find((u) => u.id === 1)!.active).toBe(false);
    expect(asked).toEqual(['/usuarios']);
    // The run resolved AFTER the repaint: by then the row already showed the new data.
    expect(order).toEqual(['resolved:false:1']);
    expect(rows()).toEqual(before);
    expect(box(1).checked).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    // Nothing reloaded: the focus and what was being typed are where they were.
    expect(document.activeElement).toBe(search);
    expect(search.value).toBe('a medio escribir');
  });

  it('BUG-61: the first pass after hydrating, with blank runs between the rows, moves no row', async () => {
    controller = hydrated();
    const tbody = document.querySelector('tbody')!;
    // The route keeps the blank runs the server wrote between the rows: the case of the bug.
    expect([...tbody.childNodes].some((n) => n.nodeType === Node.TEXT_NODE)).toBe(true);
    const records: MutationRecord[] = [];
    const observer = new MutationObserver((r) => void records.push(...r));
    observer.observe(tbody, { childList: true });
    const ana = box(1);
    ana.checked = false;
    ana.dispatchEvent(new Event('change', { bubbles: true }));
    await probe.run;
    observer.disconnect();
    expect(records.concat(observer.takeRecords())).toEqual([]);
    expect(box(1).checked).toBe(false);
  });

  it('15b. a server-side change shows in the attribute the view writes, not only in the checkbox state', async () => {
    controller = hydrated();
    // Leo is off; the server turns him on through a save from his own row.
    const leo = box(3);
    leo.checked = true;
    leo.dispatchEvent(new Event('change', { bubbles: true }));
    await probe.run;
    expect(box(3).hasAttribute('checked')).toBe(true);
  });

  it('16. removing a row takes it out of the table; the others are the same nodes', async () => {
    controller = hydrated();
    const [ana, , leo] = rows();
    (document.querySelector('tr[data-id="2"] button') as HTMLButtonElement).click();
    await probe.run;
    expect(asked).toEqual(['/usuarios']);
    expect(rows()).toHaveLength(2);
    expect(rows()[0]).toBe(ana);
    expect(rows()[1]).toBe(leo);
    expect(document.querySelector('tr[data-id="2"]')).toBeNull();
    expect(reload).not.toHaveBeenCalled();
  });

  it('17. with the data endpoint failing, the listener reloads the document', async () => {
    endpointFails = true;
    controller = hydrated();
    const before = rows();
    const ana = box(1);
    ana.checked = false;
    ana.dispatchEvent(new Event('change', { bubbles: true }));
    await probe.run;
    expect(asked).toEqual(['/usuarios']);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(rows()).toEqual(before);
  });

  it('a route torn down stops listening: a call after r() repaints nothing and reloads nothing', async () => {
    controller = hydrated();
    controller.r();
    controller = undefined;
    const waits: Promise<void>[] = [];
    document.dispatchEvent(
      new CustomEvent(DATA_STALE_EVENT, { detail: { paths: ['/usuarios'], wait: (d: Promise<void>) => void waits.push(d) } }),
    );
    expect(waits).toEqual([]);
    expect(asked).toEqual([]);
  });
});

/** The table painted from a signal sown from `data`, which the page can add to (BUG-55 §2). */
const SEEDED = [
  '<link rel="layout" href="./l.fud">',
  '<link rel="server" href="./usuarios.fudapi">',
  '@code {',
  '  import { signal, task } from "@fudic/core";',
  '  const personas = signal(data.users);',
  '  const vistas = signal(0);',
  '  const borrar = task(remove);',
  '  function quitar(id) { probe.run = borrar.run({ id }); }',
  '  function alta() { personas.set([...personas(), { id: 9, name: "Ivo", active: true }]); vistas.set(vistas() + 1); }',
  '}',
  '<button class="alta" @click=@alta>alta</button>',
  '<output class="vistas">@vistas()</output>',
  '<table><tbody>',
  '@foreach (const p of personas()) key (p.id) {',
  '<tr data-id=@p.id><td>@p.name</td><td><button @click=@quitar(p.id)>Borrar</button></td></tr>',
  '}',
  '</tbody></table>',
].join('\n');

const ids = (): string[] => rows().map((r) => r.dataset['id']!);

describe('a signal sown from `data` is sown again by the new one (BUG-55 §2)', () => {
  it('4. removing a row takes it out of the signal the table paints', async () => {
    controller = hydrated(SEEDED);
    (document.querySelector('tr[data-id="2"] button') as HTMLButtonElement).click();
    await probe.run;
    expect(asked).toEqual(['/usuarios']);
    expect(ids()).toEqual(['1', '3']);
  });

  it('4. the server wins: what the page added and the server does not have is gone', async () => {
    controller = hydrated(SEEDED);
    (document.querySelector('button.alta') as HTMLButtonElement).click();
    expect(ids()).toEqual(['1', '2', '3', '9']);
    (document.querySelector('tr[data-id="1"] button') as HTMLButtonElement).click();
    await probe.run;
    expect(ids()).toEqual(['2', '3']);
  });

  it('5. a signal that does not read `data` keeps its value', async () => {
    controller = hydrated(SEEDED);
    (document.querySelector('button.alta') as HTMLButtonElement).click();
    (document.querySelector('tr[data-id="1"] button') as HTMLButtonElement).click();
    await probe.run;
    expect(document.querySelector('output.vistas')!.textContent).toBe('1');
  });
});

describe('loadImport — what the chunk asks its data again with', () => {
  it("names the route's own load, from its browser module", () => {
    const graph = resolveDocument('/usuarios.fud', {
      ...memoryIo({ '/usuarios.fud': ROUTE, '/l.fud': LAYOUT }),
      api: () => API,
    }).value;
    expect(loadImport(graph)).toBe('import { load as $load } from "fudic:routes/usuarios";');
  });

  it('a route whose .fudapi declares no load has none to import', () => {
    const graph = resolveDocument('/usuarios.fud', {
      ...memoryIo({ '/usuarios.fud': ROUTE, '/l.fud': LAYOUT }),
      api: () => ({ ...API, load: false }),
    }).value;
    expect(loadImport(graph)).toBeUndefined();
  });

  it('a component graph links no route api', () => {
    const graph = resolveComponents(
      '/page.fud',
      memoryIo({
        '/page.fud': '<link rel="component" href="./x-a.fud">\n<html><head></head><body><x-a></x-a></body></html>\n',
        '/x-a.fud': '<x-a>\n  <template shadowrootmode="open"><b>a</b></template>\n</x-a>\n',
      }),
    );
    expect(loadImport(graph)).toBeUndefined();
  });
});
