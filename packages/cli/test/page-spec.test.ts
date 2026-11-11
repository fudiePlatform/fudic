/**
 * SDD-82 §3.10 and criterion 35 — `fudic g spec /<route>` and `fudic g flow <name>`: the
 * criteria of a page and its fixture with a `data` sampled from `LoadData`, and those of a flow.
 *
 * The plans run over a `MemoryFs` with the contract reader injected; one run over a real project
 * inside this package's `node_modules` (so `@fudic/http/contract` and `@fudic/spec` resolve as
 * they do for an app) uses the default reader and holds the fixtures to strict `tsc`.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { flowFixtureModule, flowSpecSkeleton, pageFixtureModule, pageSpecSkeleton, type PropField } from '@fudic/spec';
import { writeApiDeclarations } from '@fudic/typecheck/api';
import { parseArgs } from '../src/args.js';
import { nodeReadIo, nodeWriteIo } from '../src/io.js';
import { planFlow } from '../src/plans/flow.js';
import { planPageSpec, type ContractReader, type RouteContract } from '../src/plans/page-spec.js';
import { run } from '../src/run.js';
import { captureStreams, contentsOf, MemoryFs, projectFs, RecordingRunner } from './helpers.js';
import type { SpecOptions } from '../src/types.js';

const CWD = '/project';
const PAGE = '<!DOCTYPE html>\n<html lang="en">\n  <body>\n    <h1>hi</h1>\n  </body>\n</html>\n';
const LOAD: readonly PropField[] = [
  { name: 'title', required: true, shape: { kind: 'string' } },
  { name: 'users', required: true, shape: { kind: 'array', element: { kind: 'opaque' } } },
];

const options = (over: Partial<SpecOptions> = {}): SpecOptions => ({ cwd: CWD, force: false, ...over });
const created = (plan: { readonly changes: readonly { readonly kind: string; readonly path: string }[] }) =>
  plan.changes.map((change) => `${change.kind} ${change.path}`);

/** A project with the routes given, each a page. */
const project = (routes: readonly string[], extra: Readonly<Record<string, string>> = {}): MemoryFs =>
  projectFs({ ...Object.fromEntries(routes.map((r) => [`src/routes/${r}`, PAGE])), ...extra }, CWD);

/** A reader that answers `contract` and remembers what it was asked. */
function reader(contract: RouteContract | undefined): ContractReader & { calls: string[] } {
  const calls: string[] = [];
  return Object.assign(
    (_root: string, api: string) => {
      calls.push(api.slice(api.indexOf('/src/')));
      return Promise.resolve(contract);
    },
    { calls },
  );
}

describe('parseArgs', () => {
  it('g spec takes a route; g flow its name, with --project', () => {
    expect(parseArgs(['g', 'spec', '/usuarios'])).toMatchObject({ kind: 'spec', name: '/usuarios' });
    expect(parseArgs(['g', 'flow', 'alta', '--project', 'web'])).toMatchObject({ kind: 'flow', name: 'alta', opts: { project: 'web' } });
  });

  it('g flow refuses a flag it does not take, and needs a name', () => {
    expect(parseArgs(['g', 'flow', 'alta', '--dir', 'x']).kind).toBe('error');
    expect(parseArgs(['g', 'flow'])).toMatchObject({ kind: 'error', error: { message: 'fudic generate flow needs a name' } });
  });
});

describe('g spec /<route> (criterion 35)', () => {
  it('writes the page .fudspec and its fixture: data from LoadData, calls empty', async () => {
    const read = reader({ load: LOAD, paths: false });
    const plan = await planPageSpec('/usuarios', options(), project(['usuarios.fud']), read);
    expect(plan.errors).toEqual([]);
    expect(created(plan)).toEqual(['create src/routes/usuarios.fudspec', 'create src/routes/usuarios.fixture.ts']);
    expect(contentsOf(plan.changes[0])).toBe(pageSpecSkeleton('/usuarios', { data: 'base' }));
    expect(contentsOf(plan.changes[1])).toBe(pageFixtureModule('routes/usuarios', { data: { name: 'base', fields: LOAD }, paths: false }));
    expect(contentsOf(plan.changes[1])).toContain("    base: { title: '', users: [] },\n");
    expect(read.calls).toEqual(['/src/routes/usuarios.fudapi']);
  });

  it('a route with params: path when it declares paths, url when not', async () => {
    const withPaths = await planPageSpec('/blog/[slug]', options(), project(['blog/[slug].fud']), reader({ paths: true }));
    expect(contentsOf(withPaths.changes[0])).toBe(pageSpecSkeleton('/blog/[slug]', { params: 'path' }));
    expect(contentsOf(withPaths.changes[1])).toBe(pageFixtureModule('routes/blog/[slug]', { paths: true }));
    const without = await planPageSpec('/u/[id]', options(), project(['u/[id].fud']), reader({ paths: false }));
    expect(contentsOf(without.changes[0])).toBe(pageSpecSkeleton('/u/[id]', { params: 'url' }));
    expect(contentsOf(without.changes[1])).toBe(pageFixtureModule('routes/u/[id]', {}));
  });

  it('/ is index.fud, and /x/index names x/index.fud as the header does; no .fudapi, no fixture', async () => {
    const home = await planPageSpec('/', options(), project(['index.fud', 'notes.txt']), reader(undefined));
    expect(created(home)).toEqual(['create src/routes/index.fudspec']);
    expect(contentsOf(home.changes[0])).toContain('page /\n');
    const docs = await planPageSpec('/docs/index', options(), project(['docs/index.fud']), reader({ paths: false }));
    expect(created(docs)).toEqual(['create src/routes/docs/index.fudspec', 'create src/routes/docs/index.fixture.ts']);
    expect(contentsOf(docs.changes[0])).toContain('page /docs\n');
  });

  it('keeps a fixture that exists; refuses a .fudspec that exists, and replaces it with --force', async () => {
    const fs = project(['usuarios.fud'], { 'src/routes/usuarios.fixture.ts': 'kept', 'src/routes/usuarios.fudspec': 'old' });
    const plan = await planPageSpec('/usuarios', options(), fs, reader({ load: LOAD, paths: false }));
    expect(plan.errors.map((e) => e.code)).toEqual(['FUD0443']);
    expect(plan.changes).toEqual([]);
    const forced = await planPageSpec('/usuarios', options({ force: true }), fs, reader({ load: LOAD, paths: false }));
    expect(created(forced)).toEqual(['modify src/routes/usuarios.fudspec']);
  });

  it('a page that is not there is FUD1500, about the routes folder, and nothing is read', async () => {
    const read = reader(undefined);
    const plan = await planPageSpec('/nada', options(), project(['usuarios.fud']), read);
    expect(plan.errors).toEqual([expect.objectContaining({ code: 'FUD1500', file: 'src/routes' })]);
    expect(plan.changes).toEqual([]);
    expect(read.calls).toEqual([]);
  });

  it('a library has no pages; no project, an unknown --project', async () => {
    const lib = projectFs({}, CWD, { id: 'ui', kind: 'lib', prefix: 'ui' });
    expect((await planPageSpec('/x', options(), lib, reader(undefined))).errors.map((e) => e.code)).toEqual(['FUD0783']);
    expect((await planPageSpec('/x', options(), new MemoryFs({}, CWD), reader(undefined))).errors.map((e) => e.code)).toEqual(['FUD0781']);
    expect((await planPageSpec('/x', options({ project: 'nope' }), project([]), reader(undefined))).errors.map((e) => e.code)).toEqual(['FUD0782']);
  });
});

describe('g flow <name> (criterion 35)', () => {
  it('writes src/flows/<name>.fudspec and its fixture with services empty', async () => {
    const plan = await planFlow('alta-de-usuario', options(), project([]));
    expect(plan.errors).toEqual([]);
    expect(created(plan)).toEqual(['create src/flows/alta-de-usuario.fudspec', 'create src/flows/alta-de-usuario.fixture.ts']);
    expect(contentsOf(plan.changes[0])).toBe(flowSpecSkeleton('alta-de-usuario'));
    expect(contentsOf(plan.changes[1])).toBe(flowFixtureModule());
  });

  it('keeps a fixture that exists; refuses a .fudspec that exists', async () => {
    const fs = project([], { 'src/flows/alta.fixture.ts': 'kept', 'src/flows/alta.fudspec': 'old' });
    const plan = await planFlow('alta', options(), fs);
    expect(plan.errors.map((e) => e.code)).toEqual(['FUD0443']);
    expect(plan.changes).toEqual([]);
  });

  it('a name that is not kebab-case, a library, no project', async () => {
    for (const name of ['Alta', 'alta_usuario', 'a/b', '-a', 'a-']) {
      expect((await planFlow(name, options(), project([]))).errors).toEqual([expect.objectContaining({ code: 'FUD0448', message: expect.stringContaining(`"${name}"`) })]);
    }
    const lib = projectFs({}, CWD, { id: 'ui', kind: 'lib', prefix: 'ui' });
    expect((await planFlow('alta', options(), lib)).errors.map((e) => e.code)).toEqual(['FUD0783']);
    expect((await planFlow('alta', options(), new MemoryFs({}, CWD))).errors.map((e) => e.code)).toEqual(['FUD0781']);
  });
});

describe('through the binary, over a real project: the fixtures compile (criterion 35)', () => {
  const TSC = fileURLToPath(new URL('../../../node_modules/typescript/bin/tsc', import.meta.url));
  const DIR = fileURLToPath(new URL(`../node_modules/.fudic-gspec/${String(process.pid)}/`, import.meta.url)).replace(/\\/gu, '/');
  afterAll(() => rmSync(DIR, { recursive: true, force: true }));

  const TSCONFIG = {
    compilerOptions: {
      target: 'ES2024',
      module: 'ESNext',
      moduleResolution: 'bundler',
      lib: ['ES2024', 'DOM', 'DOM.Iterable'],
      strict: true,
      noUncheckedIndexedAccess: true,
      exactOptionalPropertyTypes: true,
      isolatedModules: true,
      verbatimModuleSyntax: true,
      skipLibCheck: true,
      noEmit: true,
    },
    include: ['src/**/*.ts', '.fudic/api/**/*.d.ts'],
  };
  const FILES: Readonly<Record<string, string>> = {
    'fudic.json': JSON.stringify({ id: 'demo', kind: 'app', prefix: 'app' }),
    'tsconfig.json': JSON.stringify(TSCONFIG),
    'src/routes/gente.fud': PAGE,
    'src/routes/gente.fudapi': [
      'load ssr',
      '  title   str',
      '  count   i32',
      '  tone    Tone',
      '  owner   Person',
      '  users   Person[]  later',
      '  note    str?',
      '',
      'get search',
      '  q  str',
      '  -> Person[]',
      '',
      'enum Tone',
      '  calm',
      '  loud',
      '',
      'type Person',
      '  name    str',
      '  active  bool',
      '',
    ].join('\n'),
    'src/routes/blog/[slug].fud': PAGE,
    'src/routes/blog/[slug].fudapi': 'paths\n',
    'src/routes/about.fud': PAGE,
  };

  it('writes the page and flow files with the default reader, and strict tsc takes every fixture', async () => {
    for (const [relative, text] of Object.entries(FILES)) {
      mkdirSync(dirname(join(DIR, relative)), { recursive: true });
      writeFileSync(join(DIR, relative), text);
    }
    const capture = captureStreams();
    const deps = { readIo: nodeReadIo(), writeIo: nodeWriteIo(), runner: new RecordingRunner(), streams: capture.streams };
    for (const argv of [['g', 'spec', '/gente'], ['g', 'spec', '/blog/[slug]'], ['g', 'spec', '/about'], ['g', 'flow', 'alta']]) {
      expect(await run([...argv, '--cwd', DIR], deps), argv.join(' ')).toBe(0);
    }
    const gente = readFileSync(join(DIR, 'src/routes/gente.fixture.ts'), 'utf8');
    expect(gente).toContain("    base: { title: '', count: 0, tone: 'calm', owner: { name: '', active: false }, users: [] },\n");
    expect(readFileSync(join(DIR, 'src/routes/gente.fudspec'), 'utf8')).toContain('#     data base\n');
    expect(readFileSync(join(DIR, 'src/routes/blog/[slug].fixture.ts'), 'utf8')).toContain('  paths: [],\n');
    expect(existsSync(join(DIR, 'src/routes/about.fixture.ts'))).toBe(false);
    expect(readFileSync(join(DIR, 'src/routes/about.fudspec'), 'utf8')).toBe(pageSpecSkeleton('/about'));
    expect(readFileSync(join(DIR, 'src/flows/alta.fixture.ts'), 'utf8')).toBe(flowFixtureModule());

    writeApiDeclarations(DIR);
    let output = '';
    try {
      execFileSync(process.execPath, [TSC, '-p', DIR], { encoding: 'utf8' });
    } catch (e) {
      output = String((e as { stdout?: string }).stdout ?? e);
    }
    expect(output).toBe('');
  }, 120_000);
});
