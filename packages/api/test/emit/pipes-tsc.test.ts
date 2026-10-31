/**
 * SDD-71 criteria 5 and 7: the `.d.ts` of a pipe compiles under strict `tsc`, and so does an
 * implementation written against it, while one that gives anything but text, or that was
 * written before the contract gained a parameter, does not. What must not type is checked with
 * `@ts-expect-error`, so a type that stopped biting fails the run too.
 *
 * `@fudic/core` is mapped to its real `Pipe`: this package does not depend on it, and a copy
 * of the type here would test the copy.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createApiIndex, emitDeclarations } from '../../src/index.js';
import { BUILT_INS, app } from '../project.js';

const TSC = fileURLToPath(new URL('../../../../node_modules/typescript/bin/tsc', import.meta.url));
const PIPE = fileURLToPath(new URL('../../../core/src/pipe.ts', import.meta.url)).replace(/\\/gu, '/');
const DIR = fileURLToPath(new URL(`../../node_modules/.fudic-emit/pipes-${String(process.pid)}/`, import.meta.url));

const TSCONFIG = {
  compilerOptions: {
    target: 'ES2024',
    module: 'ESNext',
    moduleResolution: 'bundler',
    lib: ['ES2024', 'DOM'],
    strict: true,
    noUncheckedIndexedAccess: true,
    exactOptionalPropertyTypes: true,
    isolatedModules: true,
    verbatimModuleSyntax: true,
    skipLibCheck: false,
    noEmit: true,
    paths: { '@fudic/core': [PIPE] },
  },
  include: ['src/**/*.ts', '.fudic/api/**/*.d.ts'],
};

const FILES: Readonly<Record<string, string>> = {
  'pipes/truncar': '# Cuts a text.\npipe truncar\n  on str\n  max u32\n',
  'pipes/iniciales': 'pipe iniciales\n  on str\n',
  'pipes/hace': 'pipe hace\n  on date f64\n',
  'pipes/titulo': 'pipe titulo\n  on Post\n',
  'types/post': 'type Post\n  title  str\n',
};

/** `src/pipes/*.ts`, the way §4.1 writes them, and a view's `@code` that uses them. */
const IMPLEMENTATIONS = `
import type { Pipe } from '@fudic/core';
import { truncar, type TruncarArgs } from 'fudic:pipes/truncar';
import { iniciales } from 'fudic:pipes/iniciales';
import { hace } from 'fudic:pipes/hace';
import { titulo } from 'fudic:pipes/titulo';
import type { Post } from 'fudic:types/post';

export const truncarPipe = truncar.implement((value, { max }) => (value.length <= max ? value : \`\${value.slice(0, max)}…\`));
export const inicialesPipe = iniciales.implement((value, locale) => value.slice(0, 1).toLocaleUpperCase(locale));
export const hacePipe = hace.implement((value) => String(value instanceof Date ? value.getTime() : value));
export const tituloPipe = titulo.implement((post) => post.title);

const corto: Pipe<string> = truncarPipe({ max: 40 });
const args: TruncarArgs = { max: 3 };
const post: Post = { title: 'Hola' };
export const painted: readonly string[] = [
  corto.format('fudic', 'en'),
  truncarPipe(args).format('fudic', 'en'),
  inicialesPipe.format('Ada', 'en'),
  hacePipe.format(new Date(0), 'en'),
  hacePipe.format(0, 'en'),
  tituloPipe.format(post, 'en'),
];

// @ts-expect-error a pipe always gives text, not a number
truncar.implement((value) => value.length);
// @ts-expect-error a pipe always gives text, not a number — without parameters too
iniciales.implement(() => 42);
// @ts-expect-error written before the contract gained max: its second parameter is the args now
truncar.implement((value: string, locale: string) => value.slice(0, locale.length));
// @ts-expect-error with parameters, what implement gives is a function of them, not a pipe
truncar.implement((value) => value).format('fudic', 'en');
// @ts-expect-error the args are the contract's: max is a number
truncarPipe({ max: '40' });
// @ts-expect-error the args are the contract's: max is required
truncarPipe({});
// @ts-expect-error a pipe on str does not format a number
corto.format(3, 'en');
// @ts-expect-error a pipe on date f64 does not format a text
hacePipe.format('ayer', 'en');
// @ts-expect-error a pipe on Post does not format any object
tituloPipe.format({ name: 'x' }, 'en');
`;

describe('criteria 5 and 7: the .d.ts of a pipe and its implementation, under strict tsc', () => {
  it('the right implementations type, and every wrong one is an error', () => {
    mkdirSync(join(DIR, 'src', 'pipes'), { recursive: true });
    writeFileSync(join(DIR, 'tsconfig.json'), JSON.stringify(TSCONFIG));
    const sources = Object.entries(FILES).map(([id, text]) => app(id, text));
    const index = createApiIndex([...BUILT_INS, ...sources]);
    for (const source of sources) {
      const file = join(DIR, '.fudic', 'api', `${source.id}.d.ts`);
      mkdirSync(join(file, '..'), { recursive: true });
      writeFileSync(file, emitDeclarations(source, index, {}));
    }
    writeFileSync(join(DIR, 'src', 'pipes', 'all.ts'), IMPLEMENTATIONS);
    let output = '';
    try {
      execFileSync(process.execPath, [TSC, '-p', DIR], { encoding: 'utf8' });
    } catch (e) {
      output = String((e as { stdout?: string }).stdout ?? e);
    }
    expect(output).toBe('');
  }, 120_000);
});
