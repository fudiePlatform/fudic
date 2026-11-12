/**
 * SDD-82 §3.6, §3.7, §4.1: the validator over page and flow specs — criteria 4 to 7.
 */

import { describe, expect, it } from 'vitest';
import { readFixtures, type Fixtures, type FunctionInfo, type PageInfo } from '../src/index.js';
import { FW, termSource, validate, type World } from './terms.js';

const R = '/ws/src/routes';

/** The framework terms the criteria use. */
const TERMS: Readonly<Record<string, string>> = {
  [`${FW}/then/t.js`]: termSource('t', 'then'),
  [`${FW}/then/url.js`]: termSource('url', 'then', [{ name: 'expected', type: 'string' }]),
  [`${FW}/when/click.js`]: termSource('click', 'when', [{ name: 'target', type: 'element' }]),
  [`${FW}/when/go.js`]: termSource('go', 'when', [{ name: 'url', type: 'string' }]),
  [`${FW}/when/upload.js`]: termSource('upload', 'when', [
    { name: 'target', type: 'element' },
    { name: 'file', type: 'string' },
  ]),
  [`${FW}/then/called.js`]: termSource('called', 'then', [
    { name: 'fn', type: 'token' },
    { name: 'times', type: 'number' },
  ]),
  [`${FW}/then/sent.js`]: termSource('sent', 'then', [
    { name: 'fn', type: 'token' },
    { name: 'field', type: 'token' },
    { name: 'expected', type: 'string' },
  ]),
  [`${FW}/then/lists.js`]: termSource('lists', 'then', [{ name: 'value', type: 'string' }]),
};

const FIXTURE = `${R}/usuarios.fixture.ts`;
const fixtures = (source: string, path = FIXTURE): Fixtures => readFixtures(source, path);

const USERS_FIXTURE = fixtures(
  [
    'export default {',
    "  data: { 'dos-personas': {}, 'con-ana-dentro': {}, nadie: {} },",
    "  calls: { 'entra-ana': {}, 'luis-borrado': {} },",
    "  services: { 'dos-personas': [] },",
    '};',
  ].join('\n'),
);

const fn = (name: string, ...args: string[]): FunctionInfo => ({ name, args, path: `${R}/usuarios.fudapi`, span: { start: 0, end: 0 } });

const USERS: PageInfo = {
  route: '/usuarios',
  path: `${R}/usuarios.fud`,
  pattern: '/usuarios',
  params: [],
  fixture: FIXTURE,
  fixtures: USERS_FIXTURE,
  paths: false,
  functions: [fn('login', 'user'), fn('remove', 'id'), fn('save', 'user')],
};

const SLUG: PageInfo = {
  route: '/blog/[slug]',
  path: `${R}/blog/[slug].fud`,
  pattern: '/blog/:slug',
  params: ['slug'],
  fixture: `${R}/blog/[slug].fixture.ts`,
  fixtures: fixtures("export default { data: { 'en-ingles': {} }, paths: ['hola-fudic', 'dsd-in-depth'] };", `${R}/blog/[slug].fixture.ts`),
  paths: true,
  functions: [],
};

const WORLD: World = {
  files: { ...TERMS, [`${R}/fixtures/marta.png`]: 'png', '/ws/src/flows/fixtures/marta.png': 'png' },
  pages: [USERS, SLUG],
  functions: [fn('login', 'user'), fn('save', 'user', 'avatar'), fn('remove', 'id')],
  flows: { alta: fixtures("export default { services: { 'dos-personas': [] }, calls: { 'save-sin-red': {} } };", '/ws/src/flows/alta.fixture.ts') },
};

/** Code and covered text of every diagnostic. */
function found(source: string, world: World = WORLD): readonly (readonly [string, string])[] {
  return validate(source, world).map((d) => [d.code, source.slice(d.span.start, d.span.end)] as const);
}

const page = (body: string, route = '/usuarios'): string => `page ${route}\n\ncriterion a\n${body}`;
const flow = (body: string, name = 'alta'): string => `flow ${name}\n\ncriterion a\n${body}`;

describe('the page and its fixture lines (criteria 4 and 5)', () => {
  it('a page spec with its lines validates clean', () => {
    const source = page('  given\n    data dos-personas con-ana-dentro\n    answers entra-ana luis-borrado\n    services dos-personas\n    url /usuarios?q=ana\n  then\n    t\n');
    expect(found(source)).toEqual([]);
  });

  it('FUD1500 — a page that does not exist, on its route', () => {
    expect(found(page('  given\n    data x\n  then\n    t\n', '/nada'))).toEqual([['FUD1500', '/nada']]);
  });

  it('FUD1501 — data in a component, props in a page, path in a flow', () => {
    const component = `component fud-button\ncriterion a\n  given\n    data x\n  then\n    t\n`;
    expect(found(component)).toEqual([['FUD1501', 'data']]);
    expect(validate(component, WORLD)[0]?.message).toBe('`data` is a line of a page spec, and this is a component spec');
    expect(found(page('  given\n    props x\n  then\n    t\n'))).toEqual([['FUD1501', 'props']]);
    expect(found(flow('  given\n    path x\n  then\n    t\n'))).toEqual([['FUD1501', 'path']]);
  });

  it('a header without its name, or no header, still knows or does not know its kind', () => {
    expect(found('page\ncriterion a\n  given\n    props x\n  then\n    t\n')).toEqual([['FUD1501', 'props']]);
    expect(found('criterion a\n  given\n    data x\n  then\n    t\n')).toEqual([]);
  });

  it('FUD0950 — a name the fixture does not have, on the name, for each line', () => {
    expect(found(page('  given\n    data dos-personas otra\n  then\n    t\n'))).toEqual([['FUD0950', 'otra']]);
    const d = validate(page('  given\n    answers nope\n  then\n    t\n'), WORLD)[0]!;
    expect(d.message).toBe('the fixture has no answers "nope"; it has: [entra-ana, luis-borrado]');
    expect(found(page('  given\n    services x\n  then\n    t\n'))).toEqual([['FUD0950', 'x']]);
  });

  it('FUD0950 — a group the fixture does not have lists nothing', () => {
    const world: World = { ...WORLD, pages: [{ ...USERS, fixtures: fixtures('export default {};') }] };
    expect(validate(page('  given\n    data x\n  then\n    t\n'), world)[0]?.message).toBe('the fixture has no data "x"; it has: []');
  });

  it('FUD0953 — no fixture file, named by its file, on the line', () => {
    const { fixtures: _, ...bare } = USERS;
    const source = page('  given\n    data x\n  then\n    t\n');
    expect(found(source, { ...WORLD, pages: [bare] })).toEqual([['FUD0953', 'data']]);
    expect(validate(source, { ...WORLD, pages: [bare] })[0]?.message).toBe('no usuarios.fixture.ts beside the spec');
  });

  it('FUD0952 — a fixture line twice, or outside given where no term has its name', () => {
    expect(found(page('  given\n    data nadie\n    data nadie\n  then\n    t\n'))).toEqual([['FUD0952', 'data']]);
    expect(found(page('  given\n    data nadie\n  when\n    data nadie\n  then\n    t\n'))).toEqual([['FUD0952', 'data']]);
  });

  it('`url` in then is the term, not the fixture line', () => {
    expect(found(page('  given\n    url /usuarios\n  then\n    url /usuarios\n'))).toEqual([]);
  });

  it('a line with no names, or with a reference, is malformed', () => {
    expect(found(page('  given\n    data\n  then\n    t\n'))).toEqual([['FUD0947', 'data']]);
    expect(found(page('  given\n    services a b\n  then\n    t\n'))).toEqual([['FUD0947', 'services a b']]);
    expect(found(page('  given\n    data role:x\n  then\n    t\n'))).toEqual([['FUD0948', 'role:x']]);
  });

  it('FUD1510 — a name of a group the editor cannot read, on the name, pointing at the fixture', () => {
    const world: World = { ...WORLD, pages: [{ ...USERS, fixtures: fixtures('export default { data: { ...base, nadie: {} } };') }] };
    const [d, ...rest] = validate(page('  given\n    data nadie otra\n  then\n    t\n'), world);
    expect(rest).toEqual([]);
    expect(d?.code).toBe('FUD1510');
    expect(d?.related?.[0]).toMatchObject({ file: FIXTURE, message: 'in the fixture' });
  });
});

describe('the URL of a page (criterion 5)', () => {
  it('path with a value of paths opens the page', () => {
    expect(found(page('  given\n    path dsd-in-depth\n    data en-ingles\n  then\n    t\n', '/blog/[slug]'))).toEqual([]);
  });

  it('FUD1502 — a path the fixture does not list', () => {
    const source = page('  given\n    path otro\n  then\n    t\n', '/blog/[slug]');
    expect(found(source)).toEqual([['FUD1502', 'otro']]);
    expect(validate(source, WORLD)[0]?.message).toBe('"otro" is not in the fixture\'s paths: [hola-fudic, dsd-in-depth]');
  });

  it('FUD1502 lists nothing when the fixture has no paths; FUD0953 without a fixture', () => {
    expect(found(page('  given\n    path x\n  then\n    t\n'))).toEqual([['FUD1502', 'x']]);
    const { fixtures: _, ...bare } = SLUG;
    expect(found(page('  given\n    path x\n  then\n    t\n', '/blog/[slug]'), { ...WORLD, pages: [bare] })).toEqual([['FUD0953', 'path']]);
  });

  it('FUD1510 — paths the editor cannot read', () => {
    const world: World = { ...WORLD, pages: [{ ...SLUG, fixtures: fixtures('export default { paths: list };') }] };
    expect(found(page('  given\n    path x\n  then\n    t\n', '/blog/[slug]'), world)).toEqual([['FUD1510', 'x']]);
  });

  it('FUD1503 — a URL of another route', () => {
    const source = page('  given\n    url /otra\n  then\n    t\n');
    expect(found(source)).toEqual([['FUD1503', '/otra']]);
    expect(validate(source, WORLD)[0]?.message).toBe('/otra is not a URL of this page: its pattern is /usuarios');
  });

  it('FUD1504 — a page with params and neither path nor url, on the slug', () => {
    const source = page('  given\n    data en-ingles\n  then\n    t\n', '/blog/[slug]');
    expect(found(source)).toEqual([['FUD1504', 'a']]);
    expect(found(page('  given\n    url /blog/hola\n  then\n    t\n', '/blog/[slug]'))).toEqual([]);
  });

  it('a path or url of a page that does not exist is not checked', () => {
    expect(found(page('  given\n    path x\n    url /y\n  then\n    t\n', '/nada'))).toEqual([['FUD1500', '/nada']]);
  });
});

describe('flows (criteria 5 and 6)', () => {
  it('a flow with its services, answers and URLs validates clean', () => {
    const source = flow('  given\n    services dos-personas\n    answers save-sin-red\n    url /usuarios\n  when\n    go /blog/hola\n  then\n    t\n');
    expect(found(source)).toEqual([]);
  });

  it('FUD1505 — a URL no route matches, a warning, for url and go', () => {
    const source = flow('  given\n    url /nada\n  when\n    go /tampoco\n  then\n    t\n');
    expect(found(source)).toEqual([
      ['FUD1505', '/nada'],
      ['FUD1505', '/tampoco'],
    ]);
    expect(validate(source, WORLD).map((d) => d.severity)).toEqual(['warning', 'warning']);
  });

  it('go in a page spec is not checked against the routes', () => {
    expect(found(page('  when\n    go /nada\n  then\n    t\n'))).toEqual([]);
  });

  it('FUD0953 — a flow without its fixture file', () => {
    const source = flow('  given\n    services x\n  then\n    t\n', 'otro');
    expect(validate(source, WORLD)[0]?.message).toBe('no otro.fixture.ts beside the spec');
  });
});

describe('the terms that name a function, a list, a file (criterion 6)', () => {
  it('called and sent with a function in reach, and an argument of it', () => {
    expect(found(page('  then\n    called login 1\n    sent remove id "2"\n    sent login user.name "ana"\n'))).toEqual([]);
  });

  it('FUD1506 — a function the page cannot call, listing the ones it can', () => {
    const source = page('  then\n    sent borrar id "1"\n');
    expect(found(source)).toEqual([['FUD1506', 'borrar']]);
    expect(validate(source, WORLD)[0]?.message).toBe('`borrar` is not a function in reach; functions: [login, remove, save]');
    expect(found(page('  then\n    called borrar 1\n'))).toEqual([['FUD1506', 'borrar']]);
  });

  it('FUD1507 — a field that is not an argument of the function', () => {
    const source = page('  then\n    sent remove nombre "x"\n');
    expect(found(source)).toEqual([['FUD1507', 'nombre']]);
    expect(validate(source, WORLD)[0]?.message).toBe('`nombre` is not an argument of `remove`; arguments: [id]');
  });

  it('a flow reaches every function of the project', () => {
    expect(found(flow('  then\n    sent save avatar "marta.png"\n'))).toEqual([]);
    expect(found(flow('  then\n    sent nope x "y"\n'))).toEqual([['FUD1506', 'nope']]);
  });

  it('nothing is checked when the host cannot say what is in reach, nor in a component', () => {
    expect(found(flow('  then\n    sent nope x "y"\n'), { ...WORLD, functions: 'unknown' })).toEqual([]);
    expect(found(page('  then\n    sent nope x "y"\n'), { ...WORLD, pages: [{ ...USERS, functions: 'unknown' }] })).toEqual([]);
    expect(found('component fud-button\ncriterion a\n  then\n    sent nope x "y"\n')).toEqual([]);
  });

  it('FUD1513 — lists in a route without paths; not when it has them or the host cannot say', () => {
    expect(found(page('  then\n    lists x\n'))).toEqual([['FUD1513', 'lists']]);
    expect(found(page('  given\n    path hola-fudic\n  then\n    lists hola-fudic\n', '/blog/[slug]'))).toEqual([]);
    expect(found(page('  then\n    lists x\n'), { ...WORLD, pages: [{ ...USERS, paths: 'unknown' }] })).toEqual([]);
  });

  it('FUD1511 — upload of a file that is not beside the spec', () => {
    expect(found(page('  when\n    upload role:button/"Foto" "./fixtures/marta.png"\n  then\n    t\n'))).toEqual([]);
    expect(found(page('  when\n    upload role:button/"Foto" "fixtures/../fixtures/./marta.png"\n  then\n    t\n'))).toEqual([]);
    expect(found(flow('  when\n    upload role:button/"Foto" "./fixtures/marta.png"\n  then\n    t\n'))).toEqual([]);
    const source = page('  when\n    upload role:button/"Foto" "./no.png"\n  then\n    t\n');
    expect(found(source)).toEqual([['FUD1511', '"./no.png"']]);
    expect(validate(source, WORLD)[0]?.message).toBe('no file ./no.png next to the spec');
  });

  it('upload beside a component, and in a spec with nothing to resolve against', () => {
    const files = { ...TERMS, '/ws/a.png': 'png' };
    expect(found('component fud-button\ncriterion a\n  when\n    upload fud-button "./a.png"\n  then\n    t\n', { files })).toEqual([]);
    expect(found('criterion a\n  when\n    upload fud-button "./x.png"\n  then\n    t\n', { files })).toEqual([]);
  });

  it('a step that is not a tag is not an element', () => {
    expect(found(page('  when\n    click Foo>role:button\n  then\n    t\n'))).toEqual([['FUD0948', 'Foo>role:button']]);
    expect(found(page('  when\n    click fud-list>role:button/~"Ana"\n  then\n    t\n'))).toEqual([]);
  });
});

describe('as (SDD-82 §3.7)', () => {
  it('in any block, with a name', () => {
    expect(found(flow('  given\n    as luis\n  when\n    as luis\n  then\n    as main\n    t\n'))).toEqual([]);
  });

  it('FUD1512 — a name that is a term', () => {
    const source = flow('  when\n    as click\n  then\n    t\n');
    expect(found(source)).toEqual([['FUD1512', 'click']]);
    expect(found(flow('  when\n    as minHeight\n  then\n    t\n'), { ...WORLD, files: { ...TERMS, [`${FW}/then/min-height.js`]: termSource('min-height', 'then') } })).toEqual([
      ['FUD1512', 'minHeight'],
    ]);
  });

  it('one name, a token', () => {
    expect(found(flow('  when\n    as\n  then\n    t\n'))).toEqual([['FUD0947', 'as']]);
    expect(found(flow('  when\n    as "luis"\n  then\n    t\n'))).toEqual([['FUD0948', '"luis"']]);
  });
});

describe('a component spec of today (criterion 7)', () => {
  it('keeps validating as before, now with turns of when and then', () => {
    const source = 'component fud-button\ncriterion a\n  when\n    click fud-button\n  then\n    t\n  when\n    click role:button/"x"\n  then\n    t\n';
    expect(found(source)).toEqual([]);
  });
});
