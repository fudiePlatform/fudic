/**
 * The props of a component as shapes (SDD-53 §3.3, criterion 6), read by the project checker
 * over real projects on disk: `$Props` only exists once the `.fud` is projected and resolved,
 * so the program has to be the one the check builds.
 */

import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import type { PropField, PropShape } from '@fudic/spec';
import { createProjectChecker, nodeFileSystem, propShapes, toPosix, type CheckFs } from '../src/index.js';

const TSCONFIG = JSON.stringify({
  compilerOptions: { target: 'ES2024', module: 'ESNext', moduleResolution: 'bundler', strict: true, skipLibCheck: true },
  include: ['**/*.ts', '**/*.fud'],
});

type Files = Readonly<Record<string, string>>;

function project(files: Files): string {
  const root = toPosix(mkdtempSync(join(tmpdir(), 'fudic-shapes-')));
  for (const [relative, text] of Object.entries({ 'tsconfig.json': TSCONFIG, ...files })) {
    const file = join(root, relative);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  return root;
}

/** A component `app-<name>` whose props are `type`, with `prelude` declared before them. */
function component(name: string, type: string, prelude = ''): string {
  return `@code {
  ${prelude}
  const p = props<${type}>();
}

<app-${name}>
  <template shadowrootmode="open">
    <span><slot></slot></span>
  </template>
</app-${name}>
`;
}

const CASES: Readonly<Record<string, readonly [type: string, prelude?: string]>> = {
  primitives: [
    '{ s: string; n: number; b: boolean; big: bigint; nul: null; u: unknown; a: any; sym: symbol; v: void; nev: never; undef: undefined; o: object }',
  ],
  literals: ["{ one: 'x'; two: 2; neg: -1; t: true; f: false }"],
  unions: [
    "{ maybe: string | null; alias: Variant; opt?: number; onlyTrue: true | 'x'; bools: true | false | 'x'; boolOpt?: boolean }",
    "type Variant = 'default' | 'outline';",
  ],
  structures: [
    '{ item: Item; items: Item[]; pair: [string, number]; map: Record<string, number>; mixed: Mixed; both: { a: string } & { b: number } }',
    'interface Item { label: string; done?: boolean } interface Mixed { [k: string]: string; name: string }',
  ],
  opaque: [
    '{ fn: () => void; ctor: new () => object; date: Date; map: Map<string, number>; foo: Foo }',
    'class Foo { x = 1 }',
  ],
  cycle: ['{ tree: Tree }', 'interface Tree { value: string; next: Tree }'],
  deep: ['{ a: { b: { c: { d: { e: string; f: { g: string } } } } } }'],
};

const files: Record<string, string> = {
  // Not a module: the checker has no symbol for it.
  'src/script.ts': 'const loose = 1;\n',
  // A module without `$Props`.
  'src/plain.ts': 'export const answer = 42;\n',
};
for (const [name, [type, prelude]] of Object.entries(CASES)) {
  files[`src/components/app-${name}.fud`] = component(name, type, prelude);
}
const ROOT = project(files);
const checker = createProjectChecker({ root: ROOT });

const shapesOf = (name: string): readonly PropField[] | undefined =>
  checker.propShapes(join(ROOT, `src/components/app-${name}.fud`));

/** Each field as `name -> shape`, the required ones bare and the optional ones with `?`. */
function byName(fields: readonly PropField[] | undefined): Record<string, PropShape> {
  expect(fields).toBeDefined();
  return Object.fromEntries((fields ?? []).map((f) => [f.required ? f.name : `${f.name}?`, f.shape]));
}

const STRING: PropShape = { kind: 'string' };
const NUMBER: PropShape = { kind: 'number' };
const OPAQUE: PropShape = { kind: 'opaque' };
const literal = (value: string | number | boolean): PropShape => ({ kind: 'literal', value });

describe('propShapes — the example (criterion 6)', () => {
  it('reads app-card: title and href required strings, variant an optional union of two literals', () => {
    const root = fileURLToPath(new URL('../../../examples/basic', import.meta.url));
    const shapes = createProjectChecker({ root }).propShapes(join(root, 'src/components/app-card.fud'));
    expect(shapes).toEqual([
      { name: 'title', required: true, shape: STRING },
      { name: 'href', required: true, shape: STRING },
      { name: 'variant', required: false, shape: { kind: 'union', members: [literal('default'), literal('highlight')] } },
    ]);
  });
});

describe('propShapes — one shape per kind of type (criterion 6)', () => {
  it('names the primitives; `unknown` is `any`; what has no literal is opaque', () => {
    expect(byName(shapesOf('primitives'))).toEqual({
      s: STRING,
      n: NUMBER,
      b: { kind: 'boolean' },
      big: { kind: 'bigint' },
      nul: { kind: 'null' },
      u: { kind: 'any' },
      a: { kind: 'any' },
      sym: OPAQUE,
      v: OPAQUE,
      nev: OPAQUE,
      undef: OPAQUE,
      o: { kind: 'object', props: [] },
    });
  });

  it('keeps a single literal as a literal', () => {
    expect(byName(shapesOf('literals'))).toEqual({
      one: literal('x'),
      two: literal(2),
      neg: literal(-1),
      t: literal(true),
      f: literal(false),
    });
  });

  it('reads unions without the `undefined` an optional prop adds, and folds `true | false` into boolean', () => {
    const shapes = byName(shapesOf('unions'));
    expect(shapes).toMatchObject({
      'opt?': NUMBER,
      'boolOpt?': { kind: 'boolean' },
    });
    expect(shapes['maybe']).toEqual({ kind: 'union', members: expect.arrayContaining([{ kind: 'null' }, STRING]) });
    expect(shapes['alias']).toEqual({ kind: 'union', members: [literal('default'), literal('outline')] });
    // One boolean literal alone is not a boolean.
    const onlyTrue = shapes['onlyTrue'] as Extract<PropShape, { kind: 'union' }>;
    expect(onlyTrue.members).toHaveLength(2);
    expect(onlyTrue.members).toEqual(expect.arrayContaining([literal(true), literal('x')]));
    // Both are, and the boolean takes the place of the first of them.
    const bools = shapes['bools'] as Extract<PropShape, { kind: 'union' }>;
    expect(bools.members).toHaveLength(2);
    expect(bools.members).toEqual(expect.arrayContaining([{ kind: 'boolean' }, literal('x')]));
  });

  it('describes interfaces, arrays, tuples, records, index signatures with props and intersections', () => {
    const item: PropShape = {
      kind: 'object',
      props: [
        { name: 'label', required: true, shape: STRING },
        { name: 'done', required: false, shape: { kind: 'boolean' } },
      ],
    };
    expect(byName(shapesOf('structures'))).toEqual({
      item,
      items: { kind: 'array', element: item },
      pair: { kind: 'tuple', elements: [STRING, NUMBER] },
      map: { kind: 'record' },
      mixed: { kind: 'object', props: [{ name: 'name', required: true, shape: STRING }] },
      both: {
        kind: 'object',
        props: [
          { name: 'a', required: true, shape: STRING },
          { name: 'b', required: true, shape: NUMBER },
        ],
      },
    });
  });

  it('makes functions, constructors, class instances and standard-library interfaces opaque', () => {
    expect(byName(shapesOf('opaque'))).toEqual({ fn: OPAQUE, ctor: OPAQUE, date: OPAQUE, map: OPAQUE, foo: OPAQUE });
  });

  it('cuts a type that contains itself', () => {
    expect(byName(shapesOf('cycle'))).toEqual({
      tree: {
        kind: 'object',
        props: [
          { name: 'value', required: true, shape: STRING },
          { name: 'next', required: true, shape: OPAQUE },
        ],
      },
    });
  });

  it('cuts at depth 4: an object four levels below a prop is opaque, a primitive there is kept', () => {
    const fields = (props: readonly PropField[]): PropShape => ({ kind: 'object', props });
    expect(byName(shapesOf('deep'))).toEqual({
      a: fields([
        {
          name: 'b',
          required: true,
          shape: fields([
            {
              name: 'c',
              required: true,
              shape: fields([
                {
                  name: 'd',
                  required: true,
                  shape: fields([
                    { name: 'e', required: true, shape: STRING },
                    { name: 'f', required: true, shape: OPAQUE },
                  ]),
                },
              ]),
            },
          ]),
        },
      ]),
    });
  });
});

describe('propShapes — what cannot be read', () => {
  it('is undefined for a file outside the program, a script that is not a module and a module without $Props', () => {
    expect(checker.propShapes(join(ROOT, 'src/components/app-missing.fud'))).toBeUndefined();
    expect(checker.propShapes(join(ROOT, 'src/script.ts'))).toBeUndefined();
    expect(checker.propShapes(join(ROOT, 'src/plain.ts'))).toBeUndefined();
  });

  it('is the same over a program handed in directly', () => {
    let program: ts.Program | undefined;
    const typescript = {
      ...ts,
      createLanguageService: ((host: ts.LanguageServiceHost) => {
        const service = ts.createLanguageService(host);
        return { ...service, getProgram: () => (program = service.getProgram()) };
      }) as typeof ts.createLanguageService,
    } as typeof ts;
    const own = createProjectChecker({ root: ROOT }, nodeFileSystem());
    const spied = createProjectChecker({ root: ROOT, typescript });
    const file = `${ROOT}/src/components/app-literals.fud`;
    const viaChecker = spied.propShapes(file);
    expect(program).toBeDefined();
    expect(propShapes(program!, file)).toEqual(viaChecker);
    expect(own.propShapes(file)).toEqual(viaChecker);
  });

  it('is undefined when the service has no program', () => {
    const typescript = {
      ...ts,
      createLanguageService: ((host: ts.LanguageServiceHost) => ({
        ...ts.createLanguageService(host),
        getProgram: () => undefined,
      })) as typeof ts.createLanguageService,
    } as typeof ts;
    expect(createProjectChecker({ root: ROOT, typescript }).propShapes(`${ROOT}/src/components/app-literals.fud`)).toBeUndefined();
  });

  it('is undefined when mounting throws, and mounts again on the next call', () => {
    const fs = nodeFileSystem();
    let fail = true;
    const flaky: CheckFs = {
      ...fs,
      fudFiles: (at) => {
        if (fail) throw new Error('disk gone');
        return fs.fudFiles(at);
      },
    };
    const flakyChecker = createProjectChecker({ root: ROOT }, flaky);
    const file = `${ROOT}/src/components/app-literals.fud`;
    expect(flakyChecker.propShapes(file)).toBeUndefined();
    fail = false;
    expect(flakyChecker.propShapes(file)).toEqual(shapesOf('literals'));
  });
});
