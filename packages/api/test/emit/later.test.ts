/**
 * SDD-70 criterion 1 — a `later` field of `load` is a promise of its type in `LoadData`, and a
 * handler that returns the value already resolved in that field does not type under strict `tsc`.
 * What must not type is checked with `@ts-expect-error`, as in `tsc.test.ts`.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { declarationsOf, moduleOf, project } from './_project.js';

/** A route whose `load` has a resolved field, three `later` ones and an optional plain one. */
const ESPERA = [
  'load ssr',
  '  title   str',
  '  users   Person[]  later',
  '  maybe   Person[]?  later',
  '  byName  map str Person  later',
  '  plain   Person?',
  '',
  'type Person',
  '  id  i32',
  '',
].join('\n');

const p = project({ 'routes/usuarios': ESPERA });
const LOAD_DATA = declarationsOf(p, 'routes/usuarios')
  .split('\n')
  .find((l) => l.includes('export interface LoadData'))!;

describe('`later` in LoadData (SDD-70 criterion 1)', () => {
  it('`users  Person[]  later` is a promise of the list; a field without it stays as it was', () => {
    expect(LOAD_DATA).toContain('readonly users: Promise<readonly Person[]>;');
    expect(LOAD_DATA).toContain('readonly title: string;');
    expect(LOAD_DATA).toContain('readonly plain?: Person }');
  });

  it('an optional type: the field is always there, the value may be undefined (§8.2.2)', () => {
    expect(LOAD_DATA).toContain('readonly maybe: Promise<readonly Person[] | undefined>;');
  });

  it('a map', () => {
    expect(LOAD_DATA).toContain('readonly byName: Promise<Readonly<Record<string, Person>>>;');
  });
});

describe('the types of `load` in its spec (SDD-70 §3.7)', () => {
  it.each(['server', 'browser'] as const)('the %s variant names every field, a `later` one by what it resolves to', (side) => {
    const line = moduleOf(p, 'routes/usuarios', side)
      .split('\n')
      .find((l) => l.startsWith('export const load'))!;
    expect(line).toContain(
      'fields: { title: "str", users: { list: $Person }, maybe: { opt: { list: $Person } }, byName: { map: ["str", $Person] }, plain: { opt: $Person } }, later: ["users", "maybe", "byName"]',
    );
  });

  it('a `load` with no fields writes none', () => {
    const empty = project({ 'routes/vacio': 'load ssr\n' });
    expect(moduleOf(empty, 'routes/vacio', 'server')).not.toContain('fields:');
  });
});

const TSC = fileURLToPath(new URL('../../../../node_modules/typescript/bin/tsc', import.meta.url));
/** Inside the package's `node_modules`, so `@fudic/http/contract` resolves as it does for an app. */
const DIR = fileURLToPath(new URL(`../../node_modules/.fudic-emit/tsc-later-${String(process.pid)}/`, import.meta.url));

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

const HANDLERS = `
import { load, type LoadData, type Person } from 'fudic:routes/usuarios';

const people: readonly Person[] = [{ id: 1 }];

load.handle(async () => ({
  title: 't',
  users: Promise.resolve(people),
  maybe: Promise.resolve(undefined),
  byName: Promise.resolve({ ana: { id: 1 } }),
}));
load.handle(() => ({ title: 't', users: Promise.resolve(people), maybe: Promise.resolve(people), byName: Promise.resolve({}) }) satisfies LoadData);

export async function read(data: LoadData): Promise<void> {
  const users: readonly Person[] = await data.users;
  const maybe: readonly Person[] | undefined = await data.maybe;
  void [users, maybe];
  // @ts-expect-error a later field is not the list until it is awaited
  void data.users.length;
}

// @ts-expect-error a later field takes a promise, not the list already resolved
load.handle(() => ({ title: 't', users: people, maybe: Promise.resolve(people), byName: Promise.resolve({}) }));
// @ts-expect-error a later field is always there, even when its type is optional
load.handle(() => ({ title: 't', users: Promise.resolve(people), byName: Promise.resolve({}) }));
// @ts-expect-error the promise of a later field resolves to its type
load.handle(() => ({ title: 't', users: Promise.resolve('nope'), maybe: Promise.resolve(people), byName: Promise.resolve({}) }));
`;

describe('criterion 1: the build rejects a resolved value in a `later` field', () => {
  it('the .d.ts and the handlers compile under strict tsc, and the wrong ones do not', () => {
    const file = join(DIR, '.fudic', 'api', 'routes', 'usuarios.d.ts');
    mkdirSync(join(file, '..'), { recursive: true });
    mkdirSync(join(DIR, 'src', 'server'), { recursive: true });
    writeFileSync(join(DIR, 'tsconfig.json'), JSON.stringify(TSCONFIG));
    writeFileSync(file, declarationsOf(p, 'routes/usuarios'));
    writeFileSync(join(DIR, 'src', 'server', 'handlers.ts'), HANDLERS);

    let output = '';
    try {
      execFileSync(process.execPath, [TSC, '-p', DIR], { encoding: 'utf8' });
    } catch (e) {
      output = String((e as { stdout?: string }).stdout ?? e);
    }
    expect(output).toBe('');
  }, 120_000);
});
