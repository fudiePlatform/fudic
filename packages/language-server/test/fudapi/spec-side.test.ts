/**
 * SDD-82 §8.2.7, §8.2.9 and §8.2.42 — what the `.fudapi` host tells a `.fudspec`: what a page or
 * a flow can call, what a page's fixture holds, and the components a route links in the types
 * the editor writes (the build's `Calls`, with their functions).
 */

import { describe, expect, it } from 'vitest';
import { APP, FILES, SRC, world } from './_api.js';

const ROUTES = `${SRC}/routes`;
const LISTA = `${SRC}/components/lista`;

const PAGE_FILES: Readonly<Record<string, string | undefined>> = {
  ...FILES,
  [`${APP}/fudic.json`]: '{}',
  [`${ROUTES}/usuarios.fud`]: '<link rel="component" href="../components/lista.fud">\n<app-usuarios></app-usuarios>\n',
  [`${ROUTES}/usuarios.fudapi`]: 'load ssr\n  users  str[]\n\nget search\n  q  str\n  -> str[]\n',
  [`${ROUTES}/blog/[slug].fudapi`]: 'paths\n\npost like\n  n  i32\n',
  [`${LISTA}.fud`]: '<app-lista></app-lista>\n',
  [`${LISTA}.fudapi`]: 'delete remove\n  id  i32\n',
  [`${SRC}/rules/alias.fudapi`]: 'rule alias-taken\n  runs remote\n  on str\n  fails alias-taken\n',
};

describe('what a .fudspec of the project can call (SDD-82 §8.2.9)', () => {
  it('reaches the route’s functions, its components’ and the remote rules, with their arguments', () => {
    const { host } = world({ files: PAGE_FILES });
    const reach = host.specReach(APP);
    const page = reach.reach(`${ROUTES}/usuarios.fud`);
    expect(page.paths).toBe(false);
    expect(page.functions.map((f) => [f.name, f.args, f.path])).toEqual([
      ['search', ['q'], `${ROUTES}/usuarios.fudapi`],
      ['remove', ['id'], `${LISTA}.fudapi`],
      ['alias-taken', ['value', 'params'], `${SRC}/rules/alias.fudapi`],
    ]);
    const blog = reach.reach(`${ROUTES}/blog/[slug].fud`);
    expect(blog.paths).toBe(true);
    expect(blog.functions[0]).toMatchObject({ name: 'like', args: ['slug', 'n'] });
    expect(reach.functions().map((f) => f.name)).toEqual(['like', 'search', 'remove', 'alias-taken']);
  });

  it('reads the .fudapi as the editor has them, at each question', () => {
    const open: Record<string, string> = {};
    const { host } = world({ files: PAGE_FILES, open });
    const reach = host.specReach(APP);
    expect(reach.reach(`${ROUTES}/usuarios.fud`).functions[0]?.name).toBe('search');
    open[`${ROUTES}/usuarios.fudapi`] = 'get find\n  q  str\n';
    expect(reach.reach(`${ROUTES}/usuarios.fud`).functions[0]?.name).toBe('find');
  });
});

describe('what a page’s fixture holds (SDD-82 §8.2.42)', () => {
  it('says the route’s id, the fields of its load and whether it declares paths', () => {
    const { host } = world({ files: PAGE_FILES });
    expect(host.pageContract(`${ROUTES}/usuarios.fud`)).toEqual({
      id: 'routes/usuarios',
      load: [{ name: 'users', required: true, shape: { kind: 'array', element: { kind: 'string' } } }],
      paths: false,
    });
    expect(host.pageContract(`${ROUTES}/blog/[slug].fud`)).toEqual({ id: 'routes/blog/[slug]', paths: true });
    expect(host.pageContract(`${ROUTES}/_error.fud`)).toBeUndefined();
  });
});

describe('the types of a route list its components’ functions (SDD-82 §8.2.7)', () => {
  it('writes them into Calls, as the build does', () => {
    const { host, fs } = world({ files: PAGE_FILES });
    host.generate(APP);
    const types = fs.readFile(`${APP}/.fudic/api/routes/usuarios.d.ts`) ?? '';
    expect(types).toMatch(/interface Calls \{[^}]*"search"\?[^}]*"remove"\?/su);
  });
});
