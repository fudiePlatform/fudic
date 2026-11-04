/**
 * The phases of a piece (SDD-77 §4.4, §8.2.35), off the files, the history and the project
 * service. The service and the history are answered here; the files are a folder of the test's.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { UnitState } from '@fudic/history';
import type { Handler, Piece, ProjectService } from '@fudic/language-server/project';
import type { Cli } from '../src/fudic.js';
import { isLibrary, showcaseCurrent, unitsOf } from '../src/phases.js';
import { tempDir } from './helpers.js';

const dirs: { dispose(): void }[] = [];
afterEach(() => dirs.splice(0).forEach((d) => d.dispose()));

function folder(files: Readonly<Record<string, string>> = {}): string {
  const dir = tempDir();
  dirs.push(dir);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(dir.root, path, '..'), { recursive: true });
    writeFileSync(join(dir.root, path), text);
  }
  return dir.root.replace(/\\/gu, '/');
}

const pass = { state: 'pass', passed: 2, total: 2 } as const;

function state(over: Partial<UnitState> = {}): UnitState {
  return { unit: 'x', lines: [], diagnostics: [], approval: 'valid', tests: pass, spec: pass, look: 'none', done: false, ...over };
}

const handler = (name: string, connected: boolean): Handler =>
  ({ name, exported: name, kind: 'fn', methods: [], state: connected ? 'connected' : 'missing' }) as unknown as Handler;

function service(pieces: readonly Piece[], handlers: Readonly<Record<string, readonly Handler[]>> = {}): ProjectService {
  return { pieces: () => pieces, handlers: (id: string) => handlers[id] } as unknown as ProjectService;
}

function component(root: string, over: Partial<Piece> = {}): Piece {
  return {
    kind: 'component',
    name: 'app-badge',
    file: `${root}/src/components/app-badge/app-badge.fud`,
    servers: [],
    documented: { doc: true, props: 1, documented: 1 },
    ...over,
  };
}

/** A component with every file a finished one has. */
const finished = {
  'src/components/app-badge/app-badge.fud': '',
  'src/components/app-badge/app-badge.fudspec': '',
  'src/components/app-badge/app-badge.test.ts': '',
};

describe('isLibrary', () => {
  it('a fudic.json of kind lib; anything else is an app', () => {
    expect(isLibrary(folder({ 'fudic.json': '{ "kind": "lib" }' }))).toBe(true);
    expect(isLibrary(folder({ 'fudic.json': '{ "kind": "app" }' }))).toBe(false);
    expect(isLibrary(folder({ 'fudic.json': '{' }))).toBe(false);
    expect(isLibrary(folder())).toBe(false);
  });
});

describe('unitsOf', () => {
  it('a finished component: complete, with what status lists', async () => {
    const root = folder(finished);
    const [unit] = await unitsOf(root, service([component(root)]), { showcase: true, stateOf: async () => state() });
    expect(unit).toEqual({
      piece: 'src/components/app-badge/app-badge.fud',
      kind: 'component',
      name: 'app-badge',
      phase: 'done',
      complete: true,
      approval: 'valid',
      server: false,
      tests: 'pass 2/2',
      spec: 'pass 2/2',
      documented: '1/1',
      functions: { connected: 0, missing: 0 },
      connectedFunctions: [],
    });
  });

  it('closed by the history: done, and not complete', async () => {
    const root = folder(finished);
    const [unit] = await unitsOf(root, service([component(root)]), { showcase: true, stateOf: async () => state({ done: true }) });
    expect(unit).toMatchObject({ phase: 'done', complete: false });
  });

  it.each<[string, Readonly<Record<string, string>>, Partial<UnitState>, Partial<Piece>, boolean, string]>([
    ['without a .fudspec', { 'src/components/app-badge/app-badge.test.ts': '' }, {}, {}, true, 'criteria'],
    ['not approved', finished, { approval: 'expired' }, {}, true, 'criteria'],
    ['without a test file', { ...finished, 'src/components/app-badge/app-badge.test.ts': undefined as never }, {}, {}, true, 'red'],
    ['tests broken', finished, { tests: { state: 'broken', passed: 0, total: 2 } }, {}, true, 'red'],
    ['criteria never run', finished, { spec: { state: 'not run' } }, {}, true, 'red'],
    ['red for the right reason', finished, { tests: { state: 'red', passed: 0, total: 2 }, spec: { state: 'fail', passed: 0, total: 2 } }, {}, true, 'view'],
    ['tests stale', finished, { tests: { state: 'stale', last: 'pass' } }, {}, true, 'red'],
    ['a prop without doc', finished, {}, { documented: { doc: true, props: 2, documented: 1 } }, true, 'document'],
    ['no doc of its own', finished, {}, { documented: { doc: false, props: 0, documented: 0 } }, true, 'document'],
    ['a showcase not current', finished, {}, {}, false, 'showcase'],
  ])('a component %s stops at its phase', async (_why, files, over, piece, showcase, phase) => {
    const present = Object.fromEntries(Object.entries(files).filter(([, text]) => text !== undefined));
    const root = folder(present);
    const [unit] = await unitsOf(root, service([component(root, piece)]), { showcase, stateOf: async () => state(over) });
    expect(unit?.phase).toBe(phase);
    expect(unit?.complete).toBe(false);
  });

  it('runs as a person reads them', async () => {
    const root = folder(finished);
    const read = async (over: Partial<UnitState>): Promise<unknown> =>
      (await unitsOf(root, service([component(root)]), { showcase: true, stateOf: async () => state(over) }))[0]?.tests;
    expect(await read({ tests: { state: 'not run' } })).toBe('not run');
    expect(await read({ tests: { state: 'stale', last: 'red' } })).toBe('stale (was red)');
    expect(await read({ tests: { state: 'red', passed: 0, total: 6 } })).toBe('red 0/6');
  });

  describe('a route with a server', () => {
    const files = { 'src/routes/shop.fud': '', 'src/routes/shop.fudspec': '', 'src/routes/shop.test.ts': '' };
    const route = (root: string, over: Partial<Piece>): Piece => ({
      kind: 'route',
      name: '/shop',
      file: `${root}/src/routes/shop.fud`,
      servers: [],
      documented: { doc: false, props: 0, documented: 0 },
      ...over,
    });

    it('its .fudapi beside it and not linked: api', async () => {
      const root = folder(files);
      const [unit] = await unitsOf(root, service([route(root, { sibling: 'routes/shop' })]), { showcase: false, stateOf: async () => state() });
      expect(unit).toMatchObject({ phase: 'api', server: true, api: 'routes/shop' });
    });

    it('linked, a function without handler: connect; with every handler: complete', async () => {
      const root = folder(files);
      const piece = route(root, { sibling: 'routes/shop', servers: ['routes/shop'] });
      const half = { 'routes/shop': [handler('routes/shop.load', true), handler('routes/shop.save', false)] };
      const [open] = await unitsOf(root, service([piece], half), { showcase: false, stateOf: async () => state() });
      expect(open).toMatchObject({ phase: 'connect', functions: { connected: 1, missing: 1 }, connectedFunctions: ['routes/shop.load'] });
      const all = { 'routes/shop': [handler('routes/shop.load', true)] };
      const [closed] = await unitsOf(root, service([piece], all), { showcase: false, stateOf: async () => state() });
      expect(closed).toMatchObject({ phase: 'done', complete: true, functions: { connected: 1, missing: 0 } });
    });

    it('a .fudapi it reaches but whose declarations are unknown: connect', async () => {
      const root = folder(files);
      const [unit] = await unitsOf(root, service([route(root, { servers: ['shared'] })]), { showcase: false, stateOf: async () => state() });
      expect(unit).toMatchObject({ phase: 'connect', server: true, api: 'shared' });
    });

    it('in a library there is no server: no api, no connect', async () => {
      const root = folder({ ...files, 'fudic.json': '{ "kind": "lib" }' });
      const [unit] = await unitsOf(root, service([route(root, { sibling: 'routes/shop' })]), { showcase: false, stateOf: async () => state() });
      expect(unit).toMatchObject({ phase: 'done', complete: true, server: false, functions: { connected: 0, missing: 0 } });
    });
  });

  it('without stateOf, the history on disk: nothing approved, nothing run', async () => {
    const root = folder(finished);
    const [unit] = await unitsOf(root, service([component(root)]), { showcase: true });
    expect(unit).toMatchObject({ phase: 'criteria', approval: 'none', tests: 'not run' });
  });
});

describe('showcaseCurrent', () => {
  /** A CLI whose workspace, projects and plan the test decides. */
  function cli(options: { workspace?: string | null; projects?: readonly { name: string; path: string }[]; plan?: object }): Cli {
    return {
      nodeReadIo: () => ({}),
      nodeWriteIo: () => ({}),
      workspaceRoot: () => options.workspace ?? null,
      findProjects: () => options.projects ?? [],
      parseArgs: (argv: readonly string[]) => ({ kind: 'generate', argv }),
      planOf: async (_command: unknown, deps: { runner: { run(): number }; streams: { out(t: string): unknown; err(t: string): unknown } }) => {
        // A dry plan: nothing it would run runs, nothing it would say is shown.
        expect([deps.runner.run(), deps.streams.out('x'), deps.streams.err('x')]).toEqual([0, undefined, undefined]);
        return { errors: [], changes: [], ...options.plan };
      },
    } as unknown as Cli;
  }

  it('an app has no showcase to keep', async () => {
    expect(await showcaseCurrent(folder(), cli({}))).toBe(true);
  });

  it('a library outside a workspace, in one without a showcase, or not among its projects', async () => {
    const lib = folder({ 'fudic.json': '{ "kind": "lib" }' });
    expect(await showcaseCurrent(lib, cli({ workspace: null }))).toBe(true);
    const bare = folder();
    expect(await showcaseCurrent(lib, cli({ workspace: bare }))).toBe(true);
    const ws = folder({ 'apps/showcase/fudic.json': '{}' });
    expect(await showcaseCurrent(lib, cli({ workspace: ws, projects: [{ name: 'other', path: `${ws}/libs/other` }] }))).toBe(true);
  });

  it('current when g showcase would change nothing', async () => {
    const ws = folder({ 'apps/showcase/fudic.json': '{}', 'libs/ui/fudic.json': '{ "kind": "lib" }' });
    const lib = `${ws}/libs/ui`;
    const of = (plan: object): Cli => cli({ workspace: ws, projects: [{ name: 'ui', path: lib }], plan });
    expect(await showcaseCurrent(lib, of({}))).toBe(true);
    expect(await showcaseCurrent(lib, of({ deletions: [] }))).toBe(true);
    expect(await showcaseCurrent(lib, of({ changes: [{ kind: 'create', path: 'x' }] }))).toBe(false);
    expect(await showcaseCurrent(lib, of({ deletions: ['x'] }))).toBe(false);
    expect(await showcaseCurrent(lib, of({ errors: [{ code: 'X' }] }))).toBe(false);
  });
});
