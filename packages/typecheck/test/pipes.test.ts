/**
 * SDD-71 criterion 8 through the project checker, over a real project on disk: the view imports
 * the `export default` of `src/pipes/truncar.ts` and fixes it in `@code`. A value of the wrong
 * type to the left of the `|` is a type error on the value; the pipe read anywhere else is
 * `FUD1150`, because the index marks what is in the project's folder of pipes — the one its
 * `fudic.json` names, `src/pipes` when it names none.
 *
 * `@fudic/core` is installed as the names the pass reads: its `Pipe`, with `format`.
 */

import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createProjectChecker, toPosix, type CheckReport } from '../src/index.js';
import { describeFud, FudIndex } from '../src/fud-index.js';
import { memoryFs } from './_support.js';

const TSCONFIG = JSON.stringify({
  compilerOptions: { target: 'ES2024', module: 'ESNext', moduleResolution: 'bundler', strict: true, skipLibCheck: true, lib: ['ES2024', 'DOM'] },
  include: ['**/*.ts', '**/*.fud'],
});

const CORE = `export interface Pipe<in T> {
  readonly kind: 'date' | 'number' | 'currency' | 'percent' | 'relative-time' | 'list' | 'pipe';
  readonly name?: string;
  readonly options: Readonly<Record<string, unknown>>;
  format(value: T, locale: string): string;
}
export declare function currency(code: string): Pipe<number | bigint>;
`;

/** What `truncar.implement(…)` gives, without the generated module: the same type. */
const TRUNCAR = `import type { Pipe } from '@fudic/core';
declare const truncar: (args: { readonly max: number }) => Pipe<string>;
export default truncar;
`;
const INICIALES = `import type { Pipe } from '@fudic/core';
declare const iniciales: Pipe<string>;
export default iniciales;
`;

function view(name: string, markup: string, from = '../pipes'): string {
  return `@code {
  import truncar from '${from}/truncar';
  import iniciales from '${from}/iniciales';
  import { currency } from '@fudic/core';
  const corto = truncar({ max: 40 });
  const euros = currency('EUR');
  type Post = { resumen: string; autor: string; precio: number };
  const { post } = props<{ post: Post }>();
}
<app-${name}>
  <template shadowrootmode="open">
${markup}
  </template>
</app-${name}>
`;
}

function project(files: Readonly<Record<string, string>>): string {
  const root = toPosix(mkdtempSync(join(tmpdir(), 'fudic-pipes-')));
  const all = {
    'tsconfig.json': TSCONFIG,
    'node_modules/@fudic/core/package.json': JSON.stringify({ name: '@fudic/core', types: 'index.d.ts' }),
    'node_modules/@fudic/core/index.d.ts': CORE,
    ...files,
  };
  for (const [relative, text] of Object.entries(all)) {
    const file = join(root, relative);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  return root;
}

/** `CODE text` of every problem on `src/components/app-<name>.fud`. */
function found(report: CheckReport, root: string, name: string, source: string): readonly string[] {
  return report.problems
    .filter((p) => p.file === `${root}/src/components/app-${name}.fud`)
    .map((p) => `${p.code} ${source.slice(p.span.start, p.span.end)}`);
}

describe('criterion 8: a pipe of the project in the typed pass', () => {
  const SOURCES = {
    good: view('good', '<p>@(post.resumen | corto)</p><p>@(post.autor | iniciales)</p><p>@(post.precio | euros)</p>'),
    wrong: view('wrong', '<p>@(post.precio | corto)</p>'),
    read: view('read', '<p>@(corto)</p><p>@(truncar)</p><p>@(corto.options)</p>'),
  };
  const root = project({
    'src/pipes/truncar.ts': TRUNCAR,
    'src/pipes/iniciales.ts': INICIALES,
    ...Object.fromEntries(Object.entries(SOURCES).map(([name, text]) => [`src/components/app-${name}.fud`, text])),
  });
  const report = createProjectChecker({ root }).check();

  it('the three uses of §3.5 type and compile', () => {
    expect(found(report, root, 'good', SOURCES.good)).toEqual([]);
  });

  it('a number to the left of a pipe on str is a type error, on the value', () => {
    const problems = found(report, root, 'wrong', SOURCES.wrong);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^TS\d+ post\.precio$/u);
  });

  it('the pipe read anywhere but to the right of a | is FUD1150 on the use, and TypeScript is silent there', () => {
    // SDD-71 criterion 8 asked for a type error beside it; under SDD-62's one fact, one voice the
    // TS2345 that meets FUD1150 on the same stretch is not said (SDD-62 §8.2).
    expect(found(report, root, 'read', SOURCES.read)).toEqual(['FUD1150 corto', 'FUD1150 truncar', 'FUD1150 corto']);
  });
});

describe('the folder of pipes is the project\'s (SDD-71 §3.1)', () => {
  it('fudic.json names another: what is there is a pipe, src/pipes is not', () => {
    const read = view('read', '<p>@(corto)</p>', '../format');
    const other = view('other', '<p>@(corto)</p>');
    const root = project({
      'fudic.json': JSON.stringify({ kind: 'app', pipes: 'src/format' }),
      'src/format/truncar.ts': TRUNCAR,
      'src/format/iniciales.ts': INICIALES,
      'src/pipes/truncar.ts': TRUNCAR,
      'src/pipes/iniciales.ts': INICIALES,
      'src/components/app-read.fud': read,
      'src/components/app-other.fud': other,
    });
    const report = createProjectChecker({ root }).check();
    expect(found(report, root, 'read', read)).toEqual(['FUD1150 corto']);
    // Outside the folder it is a module of the project like any other: calling its default in
    // the cut is what SDD-61 refuses, on the declarator.
    expect(found(report, root, 'other', other)).toEqual(['FUD1150 corto = truncar({ max: 40 })', 'TS2345 corto']);
  });
});

describe('FudIndex.module marks a module of the folder of pipes', () => {
  const PAGE = '/p/src/routes/page.fud';
  const indexOver = (files: Record<string, string>): FudIndex => {
    const index = new FudIndex(memoryFs(files), describeFud);
    index.scan('/p');
    return index;
  };

  it('src/pipes by default; anything else is not', () => {
    const index = indexOver({ '/p/src/pipes/truncar.ts': TRUNCAR, '/p/src/lib/util.ts': 'export default 1;' });
    expect(index.module(PAGE, '../pipes/truncar')?.pipe).toBe(true);
    expect(index.module(PAGE, '../lib/util')).not.toHaveProperty('pipe');
  });

  it('a change of the folder in fudic.json is read again, and the module is marked anew', () => {
    const disk: Record<string, string> = { '/p/src/pipes/truncar.ts': TRUNCAR };
    const index = indexOver(disk);
    const before = index.module(PAGE, '../pipes/truncar');
    expect(before?.pipe).toBe(true);
    expect(index.module(PAGE, '../pipes/truncar')).toBe(before);

    disk['/p/fudic.json'] = JSON.stringify({ pipes: 'src/format' });
    const after = index.module(PAGE, '../pipes/truncar');
    expect(after).not.toBe(before);
    expect(after).not.toHaveProperty('pipe');
    expect(after?.source).toBe(TRUNCAR);
  });

  it('a fudic.json that cannot be read leaves the convention', () => {
    const index = indexOver({ '/p/fudic.json': '{', '/p/src/pipes/truncar.ts': TRUNCAR });
    expect(index.module(PAGE, '../pipes/truncar')?.pipe).toBe(true);
  });
});
