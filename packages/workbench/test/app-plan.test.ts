/**
 * SDD-82 §3.6, §4.2, §4.3: the plan of a page's and a flow's `.fudspec` — the URL each criterion
 * opens, and what the bench begins it with, read off its fixture lines and the executed fixture;
 * where a criterion without network opens (§4.7), and what the real `paths()` lists (§3.7).
 */

import { describe, expect, it } from 'vitest';
import { parseSpec } from '@fudic/spec';
import type { Bench } from '@fudic/vite';
import { entryValue, fillPattern, needsOffline, planApp, routeId, type AppFixtures } from '../src/app-plan.js';
import { readCriterion } from '../src/pages.js';
import type { BenchTarget } from '../src/target.js';

const APP = { origin: 'http://127.0.0.1:9', bench: {} as Bench, run: 'r', paths: async (pattern: string) => (pattern === '/blog/:slug' ? ['hola', { slug: 'dsd' }] : null) };
const PAGE: BenchTarget = {
  kind: 'page',
  tag: 'page-blog-slug',
  component: 'C:/p/src/routes/blog/[slug].fud',
  route: '/blog/[slug]',
  spec: 'C:/p/src/routes/blog/[slug].fudspec',
  fixture: 'C:/p/src/routes/blog/[slug].fixture.ts',
  projectRoot: 'C:/p',
};
const FLOW: BenchTarget = { kind: 'flow', tag: 'flow-alta', component: 'C:/p/src/flows/alta.fudspec', spec: 'C:/p/src/flows/alta.fudspec', fixture: null, projectRoot: 'C:/p' };

const FIXTURES: AppFixtures = {
  data: { uno: { n: 1 }, dos: { n: 2 } },
  calls: { a: { save: 1, search: ['a'] }, b: { search: ['b'] } },
  services: { memoria: [{ provide: 'Users', use: () => 'm' }] },
};

const plan = (text: string, target: BenchTarget = PAGE, fixtures: AppFixtures = FIXTURES, pattern: string | null = '/blog/:slug') =>
  planApp({ target, spec: parseSpec(text).value, fixtures, app: APP, ...(pattern !== null ? { pattern } : {}) });

describe('fillPattern and routeId', () => {
  it('fills each param with its segment of the value, encoded', () => {
    expect(fillPattern('/blog/:slug', 'hola fudic')).toBe('/blog/hola%20fudic');
    expect(fillPattern('/a/:x/b/:y', '1/2')).toBe('/a/1/b/2');
    expect(fillPattern('/a/:x/:y', '1')).toBe('/a/1/');
  });

  it('names a route by its .fudapi <id>', () => {
    expect(routeId('C:/p/src/routes/blog/[slug].fud', 'C:/p')).toBe('routes/blog/[slug]');
  });
});

describe('readCriterion', () => {
  it('keeps the fixture lines of given apart, and url elsewhere as a step', () => {
    const [criterion] = parseSpec('page /x\n\ncriterion c\n  given\n    data a b\n    answers c\n    services s\n    path p\n    url /x\n  when\n    as luis\n  then\n    url /y\n').value.criteria;
    const read = readCriterion(criterion!);
    expect(read.lines).toEqual({ data: ['a', 'b'], answers: ['c'], services: 's', path: 'p', url: '/x' });
    expect(read.steps.map((s) => [s.block, s.term, ...s.args])).toEqual([
      ['when', 'as', 'luis'],
      ['then', 'url', '/y'],
    ]);
  });
});

describe('planApp', () => {
  it('a page: its path filled into the pattern, its data in order, its answers merged, its services', () => {
    const [c] = plan('page /blog/[slug]\n\ncriterion c\n  given\n    path hola\n    data uno dos\n    answers a b\n    services memoria\n  then\n    x\n');
    expect(c).toMatchObject({ id: 'c', route: '/blog/hola', mount: 'body', fixture: null, spec: PAGE.spec });
    expect(c!.app).toMatchObject({
      origin: APP.origin,
      run: 'r',
      setup: { dir: 'C:/p/src/routes/blog', route: 'routes/blog/[slug]', data: [{ n: 1 }, { n: 2 }], answers: { save: 1, search: ['b'] } },
      names: { services: 'memoria', answers: ['a', 'b'] },
    });
    expect(c!.app!.setup.services).toHaveLength(1);
    expect(c!.steps.map((s) => s.term)).toEqual(['x']);
  });

  it('a url line wins; without path or url, the pattern itself; without a pattern, /', () => {
    expect(plan('page /x\n\ncriterion c\n  given\n    url /blog/a?b=1\n')[0]!.route).toBe('/blog/a?b=1');
    expect(plan('page /x\n\ncriterion c\n  then\n    x\n', PAGE, {}, '/usuarios')[0]!.route).toBe('/usuarios');
    expect(plan('page /x\n\ncriterion c\n  given\n    path a\n', PAGE, {}, null)[0]!.route).toBe('/');
    expect(plan('flow alta\n\ncriterion c\n  then\n    x\n', FLOW, {}, null)[0]).toMatchObject({ route: '/', app: { setup: { dir: 'C:/p/src/flows' }, names: {} } });
  });

  it('a name the fixture does not have puts the criterion in error, saying which', () => {
    for (const line of ['data nada', 'answers nada', 'services nada']) {
      const [c] = plan(`page /x\n\ncriterion c\n  given\n    ${line}\n`, PAGE, {});
      expect(c).toMatchObject({ error: 'the fixture has no entry "nada"', problem: { code: 'FUD1207' } });
      expect(c!.app).toBeUndefined();
    }
  });

  it('skips a criterion without a slug', () => {
    expect(plan('page /x\n\ncriterion\n  then\n    x\n')).toEqual([]);
  });
});

describe('the criteria without network (SDD-82 §4.7)', () => {
  it('a criterion that cuts the network, in given or in when, needs the app built; one that names it in then does not', () => {
    const steps = (block: 'given' | 'when' | 'then') => [{ block, term: 'offline', args: [], offset: 0 }];
    expect(needsOffline(steps('given'))).toBe(true);
    expect(needsOffline(steps('when'))).toBe(true);
    expect(needsOffline(steps('then'))).toBe(false);
    expect(needsOffline([])).toBe(false);
  });

  it('opens on the app built when it is there, and on dev otherwise; the rest always on dev', () => {
    const text = 'page /x\n\ncriterion sin-red\n  when\n    offline\n  then\n    x\n\ncriterion con-red\n  then\n    x\n';
    const built = planApp({ target: PAGE, spec: parseSpec(text).value, fixtures: {}, app: APP, offline: 'http://127.0.0.1:7' });
    expect(built.map((c) => c.app!.origin)).toEqual(['http://127.0.0.1:7', APP.origin]);
    const unbuilt = planApp({ target: PAGE, spec: parseSpec(text).value, fixtures: {}, app: APP });
    expect(unbuilt.map((c) => c.app!.origin)).toEqual([APP.origin, APP.origin]);
  });
});

describe('the real paths() (SDD-82 §3.7)', () => {
  it('an entry as path writes it: as it is, or the params of the pattern in order', () => {
    expect(entryValue('/blog/:slug', 'hola')).toBe('hola');
    expect(entryValue('/n/:id', 7)).toBe('7');
    expect(entryValue('/blog/:year/:slug', { slug: 'hola', year: 2026 })).toBe('2026/hola');
    expect(entryValue('/blog/:year/:slug', { slug: 'hola' })).toBe('/hola');
    expect(entryValue('/a', null)).toBe('null');
  });

  it('a page lists what its paths() gives, or null without one; a flow has none', async () => {
    const [page] = plan('page /x\n\ncriterion c\n  then\n    x\n');
    expect(await page!.app!.paths!()).toEqual(['hola', 'dsd']);
    const [other] = plan('page /x\n\ncriterion c\n  then\n    x\n', PAGE, FIXTURES, '/about');
    expect(await other!.app!.paths!()).toBeNull();
    const [none] = plan('page /x\n\ncriterion c\n  then\n    x\n', PAGE, FIXTURES, null);
    expect(await none!.app!.paths!()).toBeNull();
    const [flow] = plan('flow alta\n\ncriterion c\n  then\n    x\n', FLOW, {}, null);
    expect(flow!.app!.paths).toBeUndefined();
  });
});
