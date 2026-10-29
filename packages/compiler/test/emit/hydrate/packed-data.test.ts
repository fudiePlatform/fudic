// @vitest-environment happy-dom
/**
 * BUG-60 §4 — `fud-data` without its keys, end to end: the server writes the block by the shape
 * of `load`, and the chunk adopts the page with what it reads back by the same shape.
 *
 * `usuarios` in miniature again (see `refresh.test.ts`): a table of `data.users`, nested through
 * a `type` that names another, with a `date`, an `enum` and a `bool`. What is real: the emitted
 * page and chunk, `packData` of `@fudic/ssr` and `unpackData` of `@fudic/core`. The block the
 * browser reads is the one the server wrote, parsed from the HTML.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import * as core from '@fudic/core';
import type { Controller } from '@fudic/core';
import { browserDom } from '@fudic/dom';
import { resolveDocument } from '../../../src/emit/resolve.js';
import { emitLayoutModule, emitRouteClientModule, emitRouteModule } from '../../../src/emit/index.js';
import type { DataShape, LinkedApi } from '../../../src/types/io.js';
import { memoryIo, ssrIo } from '../_support.js';

const DATA_STALE_EVENT = 'fudic:data-stale';

const LAYOUT = '<!DOCTYPE html><html><head>@RenderHead()</head><body><main>@RenderBody()</main></body></html>';
const ROUTE = [
  '<link rel="layout" href="./l.fud">',
  '<link rel="server" href="./usuarios.fudapi">',
  '@code {',
  '  import { signal } from "@fudic/core";',
  '  const visto = signal(0);',
  '  function ver() { visto.set(visto() + 1); }',
  '}',
  '<button @click=@ver>ver</button>',
  '<table><tbody>',
  '@foreach (const p of data.users) key (p.id) {',
  '<tr data-id=@p.id><td>@p.name</td><td>@p.boss?.name</td><td>@p.since.getUTCFullYear()</td>' +
    '<td>@p.tone</td><td>@(p.active ? "sí" : "no")</td></tr>',
  '}',
  '</tbody></table>',
].join('\n');

const SHAPE: DataShape = {
  fields: { users: { list: { ref: 'Person' } }, secret: 'str' },
  types: {
    Person: {
      id: 'i32',
      name: 'str',
      boss: { opt: { ref: 'Person' } },
      since: 'date',
      tone: { oneOf: ['info', 'warn'] },
      active: 'bool',
    },
  },
};

const API: LinkedApi = {
  id: 'routes/usuarios',
  load: true,
  paths: false,
  layout: false,
  functions: [],
  forms: [],
  route: '/usuarios.fud',
  data: SHAPE,
};

const ANA = { id: 1, name: 'Ana', since: new Date(Date.UTC(2020, 0, 1)), tone: 'info', active: true };
const EVA = { id: 2, name: 'Eva', boss: ANA, since: new Date(Date.UTC(2021, 5, 1)), tone: 'warn', active: false };

const IMPORT = /^import \{([^}]*)\} from (['"])([^'"]+)\2;$/gmu;

function bindImports(source: string, modules: Readonly<Record<string, Record<string, unknown>>>): string {
  return source.replace(IMPORT, (_all, names: string, _q: string, spec: string) => {
    if (!(spec in modules)) throw new Error(`no module for ${spec}`);
    return `const {${names.replace(/\bas\b/gu, ':')}} = $m[${JSON.stringify(spec)}];`;
  });
}

const blockOf = (html: string, id: string): string => {
  const open = html.indexOf(`id="${id}"`);
  const start = html.indexOf('>', open) + 1;
  return html.slice(start, html.indexOf('</script>', start));
};

/** What the endpoint answers after a call: the `data` with its keys, as `load.fetch` hands it. */
let next: unknown;

function served(): { readonly html: string; readonly chunk: string; readonly modules: Record<string, Record<string, unknown>> } {
  const graph = resolveDocument('/usuarios.fud', {
    ...memoryIo({ '/usuarios.fud': ROUTE, '/l.fud': LAYOUT }),
    api: (path) => (path === '/usuarios.fudapi' ? API : undefined),
  }).value;
  const modules = {
    '@fudic/core': core,
    'fudic:routes/usuarios': { load: { fetch: async () => next } },
  };
  const layoutSource = emitLayoutModule(graph, graph.layouts[0]!).replace(/^export\s+/gmu, '');
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const layout = new Function(`${layoutSource}\nreturn layout;`)() as unknown;
  const routeSource = bindImports(
    emitRouteModule(graph, { routeName: 'usuarios' }).replace(/^import \{ layout \} from '\.\/l\.mjs';$/mu, ''),
    modules,
  ).replace(/^export\s+/gmu, '');
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const page = new Function('$m', 'layout', `${routeSource}\nreturn page;`)(modules, layout) as (
    data: unknown,
    io: unknown,
  ) => Iterable<string>;
  const html = [...page({ users: [ANA, EVA], secret: 'x' }, ssrIo().io)].join('');
  return { html, chunk: emitRouteClientModule(graph)!, modules };
}

let controller: Controller | undefined;
afterEach(() => {
  controller?.r();
  controller = undefined;
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('`fud-data` by the shape of `load` (BUG-60)', () => {
  it('1, 2. the block carries no key at any depth, and the roots the chunk does not read stay home', () => {
    const block = blockOf(served().html, 'fud-data');
    expect(JSON.parse(block)).toEqual([
      [
        [1, 'Ana', null, Date.UTC(2020, 0, 1), 0, 1],
        [2, 'Eva', [1, 'Ana', null, Date.UTC(2020, 0, 1), 0, 1], Date.UTC(2021, 5, 1), 1, 0],
      ],
    ]);
    expect(block).not.toMatch(/"(?:users|name|boss|since|tone|active|secret)"/u);
  });

  it('3, 6. the chunk adopts the page from what it reads back, and a refresh still repaints it', async () => {
    vi.stubGlobal('location', { ...location, pathname: '/usuarios', reload: vi.fn() });
    const { html, chunk, modules } = served();
    document.body.innerHTML = html.slice(html.indexOf('>', html.indexOf('<body')) + 1, html.lastIndexOf('</body>'));
    expect(chunk).toContain('unpackData as $unpackData');
    const rows = (): string[] => [...document.querySelectorAll('tbody tr')].map((r) => r.outerHTML);
    const before = rows();

    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const factory = new Function('$m', bindImports(chunk, modules).replace(/^export default /mu, 'return '))(modules) as (
      props: readonly unknown[],
    ) => Controller;
    controller = factory([browserDom, document.body, JSON.parse(blockOf(html, 'fud-data'))]);
    controller.h!();
    // A repaint over what was adopted: the values read back are the server's, `Date` and all.
    (document.querySelector('button') as HTMLButtonElement).click();
    controller.u([]);
    expect(rows()).toEqual(before);
    expect(document.querySelector('tr[data-id="2"]')!.textContent).toBe('EvaAna2021warnno');

    next = { users: [{ ...EVA, name: 'Eva G.' }] };
    const waits: Promise<void>[] = [];
    document.dispatchEvent(
      new CustomEvent(DATA_STALE_EVENT, { detail: { paths: ['/usuarios'], wait: (d: Promise<void>) => void waits.push(d) } }),
    );
    await Promise.all(waits);
    expect([...document.querySelectorAll('tbody tr')].map((r) => r.textContent)).toEqual(['Eva G.Ana2021warnno']);
  });
});
