/**
 * `specContextOf` for pages and flows (SDD-82 §4.1): the page by its route with its fixture and
 * its reach, the flow with its fixture, the routes, the project's functions and the disk.
 */

import { describe, expect, it } from 'vitest';
import { flowFixturePathOf, pageFixturePathOf, specContextOf, type FunctionInfo } from '../src/index.js';
import { memoryFs } from './terms.js';

const ROOT = '/ws';
const R = `${ROOT}/src/routes`;
const LOGIN: FunctionInfo = { name: 'login', args: ['user'], path: `${R}/usuarios.fudapi`, span: { start: 0, end: 0 } };

const FILES = {
  [`${R}/usuarios.fud`]: '',
  [`${R}/usuarios.fixture.ts`]: "export default { data: { nadie: {} } };",
  [`${R}/blog/[slug].fud`]: '',
  [`${ROOT}/src/flows/alta.fixture.ts`]: "export default { services: { vacio: [] } };",
};

describe('specContextOf — pages and flows', () => {
  const ctx = specContextOf(ROOT, {
    fs: memoryFs(FILES),
    component: () => undefined,
    frameworkTerms: null,
    reach: (page) => ({ paths: page.endsWith('[slug].fud'), functions: page.endsWith('usuarios.fud') ? [LOGIN] : [] }),
    functions: () => [LOGIN],
  });

  it('a page by its route, with its pattern, its fixture read and what it reaches', () => {
    const page = ctx.page('/usuarios')!;
    expect(page).toMatchObject({ route: '/usuarios', path: `${R}/usuarios.fud`, pattern: '/usuarios', fixture: `${R}/usuarios.fixture.ts`, paths: false, functions: [LOGIN] });
    expect(page.fixtures?.data?.names.map((n) => n.text)).toEqual(['nadie']);
  });

  it('a page without a fixture file, and one that does not exist', () => {
    const slug = ctx.page('/blog/[slug]')!;
    expect(slug.fixtures).toBeUndefined();
    expect([slug.params, slug.paths]).toEqual([['slug'], true]);
    expect(ctx.page('/nada')).toBeUndefined();
  });

  it('a flow by its name, with or without its fixture', () => {
    expect(ctx.flow('alta')).toMatchObject({ name: 'alta', fixture: `${ROOT}/src/flows/alta.fixture.ts`, dir: `${ROOT}/src/flows` });
    expect(ctx.flow('alta').fixtures?.services?.names.map((n) => n.text)).toEqual(['vacio']);
    expect(ctx.flow('otro').fixtures).toBeUndefined();
  });

  it('every route, read once; the project functions; the disk', () => {
    expect(ctx.routes().map((r) => r.route)).toEqual(['/blog/[slug]', '/usuarios']);
    expect(ctx.routes()).toBe(ctx.routes());
    expect(ctx.functions()).toEqual([LOGIN]);
    expect([ctx.exists(`${R}/usuarios.fud`), ctx.exists(`${R}/no.fud`)]).toEqual([true, false]);
  });

  it('without the host hooks, reach and functions are unknown', () => {
    const bare = specContextOf(ROOT, { fs: memoryFs(FILES), component: () => undefined, frameworkTerms: null });
    expect(bare.page('/usuarios')).toMatchObject({ paths: 'unknown', functions: 'unknown' });
    expect(bare.functions()).toBe('unknown');
  });

  it('a file of no project has no routes', () => {
    const none = specContextOf('', { fs: memoryFs(FILES), component: () => undefined });
    expect(none.routes()).toEqual([]);
    expect(none.page('/usuarios')).toBeUndefined();
  });

  it('the fixture paths of a page and a flow', () => {
    expect(pageFixturePathOf(`${R}/blog/[slug].fud`)).toBe(`${R}/blog/[slug].fixture.ts`);
    expect(pageFixturePathOf(`${R}/index.fud`)).toBe(`${R}/index.fixture.ts`);
    expect(flowFixturePathOf(ROOT, 'alta')).toBe(`${ROOT}/src/flows/alta.fixture.ts`);
  });
});
