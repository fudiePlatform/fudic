/**
 * SDD-82 §3.4 and criterion 8: the `.d.ts` of a route exports `Calls` and `Fixtures`, and strict
 * `tsc` holds a fixture to them — a `later` only where `load` has one, a `fails` code only one the
 * function declares, a file only for a `-> file`.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createApiIndex, emitDeclarations, linkedComponents, type ApiContext, type ApiSource } from '../../src/index.js';
import { app, BUILT_INS } from '../project.js';

const lines = (...l: string[]): string => [...l, ''].join('\n');

const FILES: Readonly<Record<string, string>> = {
  'routes/gente': lines(
    'load ssr',
    '  title  str',
    '  users  Person[]  later',
    '',
    'get search',
    '  q  str',
    '  -> Person[]',
    '',
    'put save',
    '  id  i32',
    '  fails ana 409 "Ana stays."',
    '  fails locked 423 "Locked."',
    '',
    'get exportar',
    '  -> file',
    '',
    'type Person',
    '  id  i32',
  ),
  'routes/blog/[slug]': lines('paths', '', 'post like'),
  'routes/_error': lines('get oops'),
  'components/user-card': lines('post vote', '  up  bool', '', 'post save', '  other  str', '  -> str', '', 'type Card', '  n  i32'),
  'components/elsewhere': lines('post never'),
  'rules/people': lines('rule alias-taken', '  on field str', '  runs remote', '  fails alias-taken', '', 'rule nif', '  on field str', '  runs server', '  fails nif'),
};

const sources: Record<string, ApiSource> = Object.fromEntries(Object.entries(FILES).map(([id, text]) => [id, app(id, text)]));
const index = createApiIndex([...BUILT_INS, ...Object.values(sources)]);
const CTX: Readonly<Record<string, ApiContext>> = {
  'routes/gente': { route: { params: [], pattern: '/gente', components: ['components/user-card', 'components/missing'] } },
  'routes/blog/[slug]': { route: { params: ['slug'], pattern: '/blog/:slug' } },
  'routes/_error': { route: { params: ['status'], pattern: '/_fudic/error/:status', error: true } },
};
const dts = (id: string): string => emitDeclarations(sources[id]!, index, CTX[id] ?? {});

describe('Calls and Fixtures in the .d.ts of a route (SDD-82 §3.4)', () => {
  const gente = dts('routes/gente');

  it('data from load, calls and services, imported from the contract', () => {
    expect(gente).toContain('readonly data?: Readonly<Record<string, FixtureOf<LoadData> | Failed | Redirected>>;');
    expect(gente).toContain('readonly calls?: Readonly<Record<string, Calls>>;');
    expect(gente).toContain('readonly services?: Readonly<Record<string, readonly ServiceOverride[]>>;');
    expect(gente).not.toContain('readonly paths?');
    expect(gente).toMatch(/import type \{[^}]*\bAnswer\b[^}]*\bFileAnswer\b[^}]*\} from '@fudic\/http\/contract';/u);
  });

  it('one entry per function of the route, of the components it links and per remote rule; the first name wins', () => {
    const calls = gente.slice(gente.indexOf('export interface Calls'), gente.indexOf('export interface Fixtures'));
    expect(calls.split('\n').filter((l) => l.includes('?:')).map((l) => l.trim())).toEqual([
      'readonly "search"?: Answer<readonly Person[]>;',
      "readonly \"save\"?: Answer<void, 'ana' | 'locked'>;",
      'readonly "exportar"?: Answer<FileAnswer>;',
      'readonly "vote"?: Answer<void>;',
      "readonly \"alias-taken\"?: Answer<void, 'alias-taken'>;",
    ]);
  });

  it('paths when the route declares it, and no data without load', () => {
    const blog = dts('routes/blog/[slug]');
    expect(blog).toContain('readonly paths?: readonly string[];');
    expect(blog).not.toContain('readonly data?');
    expect(blog).not.toContain('FixtureOf');
  });

  it('no Fixtures for the error page, nor for a file that is not a route', () => {
    expect(dts('routes/_error')).not.toContain('Fixtures');
    expect(dts('components/user-card')).not.toContain('Fixtures');
  });

  it('an empty Calls when nothing is in reach', () => {
    const lone = app('routes/sola', lines('load ssr', '  t  str'));
    const text = emitDeclarations(lone, createApiIndex([...BUILT_INS, lone]), { route: { params: [], pattern: '/sola' } });
    expect(text).toContain('export interface Calls {}');
    expect(text).not.toMatch(/\bAnswer\b/u);
  });
});

describe('linkedComponents', () => {
  it('the components a page links by a relative path, as absolute paths of their .fud', () => {
    const page = '/ws/src/routes/gente/index.fud';
    const source = [
      '<link rel="component" href="../../components/user-card.fud">',
      "<link href='./local.fud' rel='component'>",
      '<link rel="component" href="@acme/ui/x.fud">',
      '<link rel="component" href="/abs.fud">',
      '<link rel="component">',
      '<link rel="layout" href="../../layouts/_layout.fud">',
      '<link rel="stylesheet" href="./a.css">',
    ].join('\n');
    expect(linkedComponents(page, source)).toEqual(['/ws/src/components/user-card.fud', '/ws/src/routes/gente/local.fud']);
  });
});

const TSC = fileURLToPath(new URL('../../../../node_modules/typescript/bin/tsc', import.meta.url));
/** Inside the package's `node_modules`, so `@fudic/http/contract` resolves as it does for an app. */
const DIR = fileURLToPath(new URL(`../../node_modules/.fudic-emit/tsc-fixtures-${String(process.pid)}/`, import.meta.url));

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
    skipLibCheck: false,
    noEmit: true,
  },
  include: ['src/**/*.ts', '.fudic/api/**/*.d.ts'],
};

/** A fixture written with the contract's types, as `@fudic/spec`'s helpers return them. */
const FIXTURE = `
import type { Failed, FileAnswer, Later, Redirected } from '@fudic/http/contract';
import type { Fixtures, Person } from 'fudic:routes/gente';

const fails = <const C extends string>(code: C): Failed<C> => ({ $fails: { code } });
const status = (s: number, title: string): Failed => ({ $fails: { status: s, title } });
const later = <T>(ms: number, value: T): Later<T> => ({ $later: ms, value });
const never: Later<never> = { $later: 'never' };
const redirects = (to: string): Redirected => ({ $redirects: to, status: 303 });
const file = (path: string): FileAnswer => ({ $file: path });

const ana: Person = { id: 1 };

export default {
  data: {
    now: { title: 't', users: [ana] },
    soon: { title: 't', users: later(2000, [ana]) },
    down: status(503, 'down'),
    away: redirects('/entrar'),
  },
  calls: {
    found: { search: [ana], save: undefined },
    slow: { search: never },
    refused: { save: fails('ana'), vote: status(401, 'no') },
    csv: { exportar: file('./a.csv') },
    taken: { 'alias-taken': fails('alias-taken') },
  },
  services: { none: [] },
} satisfies Fixtures;

// @ts-expect-error a later where load has none
export const a = { data: { x: { title: later(1, 't'), users: [] } } } satisfies Fixtures;
// @ts-expect-error a code save does not declare
export const b = { calls: { x: { save: fails('luis') } } } satisfies Fixtures;
// @ts-expect-error a file for a function that does not return one
export const c = { calls: { x: { search: file('./a.csv') } } } satisfies Fixtures;
// @ts-expect-error a value for a function that returns a file
export const d = { calls: { x: { exportar: 'csv' } } } satisfies Fixtures;
// @ts-expect-error a function out of reach
export const e = { calls: { x: { never: undefined } } } satisfies Fixtures;
`;

describe('criterion 8: tsc holds a fixture to the .d.ts', () => {
  it('the right fixture compiles under strict tsc, and each wrong one does not', () => {
    const file = join(DIR, '.fudic', 'api', 'routes', 'gente.d.ts');
    mkdirSync(join(file, '..'), { recursive: true });
    mkdirSync(join(DIR, 'src', 'routes'), { recursive: true });
    writeFileSync(join(DIR, 'tsconfig.json'), JSON.stringify(TSCONFIG));
    writeFileSync(file, dts('routes/gente'));
    for (const id of ['components/user-card', 'rules/people']) {
      const other = join(DIR, '.fudic', 'api', `${id}.d.ts`);
      mkdirSync(join(other, '..'), { recursive: true });
      writeFileSync(other, dts(id));
    }
    writeFileSync(join(DIR, 'src', 'routes', 'gente.fixture.ts'), FIXTURE);

    let output = '';
    try {
      execFileSync(process.execPath, [TSC, '-p', DIR], { encoding: 'utf8' });
    } catch (e) {
      output = String((e as { stdout?: string }).stdout ?? e);
    }
    expect(output).toBe('');
  }, 120_000);
});
