/**
 * SDD-82 §3.6, §4.2, §4.3: the plan of a page's and a flow's `.fudspec` — the URL each criterion
 * opens, and what the bench begins it with, read off its fixture lines and the executed fixture.
 */

import { describe, expect, it } from 'vitest';
import { parseSpec } from '@fudic/spec';
import type { Bench } from '@fudic/vite';
import { fillPattern, planApp, routeId, type AppFixtures } from '../src/app-plan.js';
import { readCriterion } from '../src/pages.js';
import type { BenchTarget } from '../src/target.js';

const APP = { origin: 'http://127.0.0.1:9', bench: {} as Bench, run: 'r' };
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
