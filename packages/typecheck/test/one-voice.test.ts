/**
 * One fact, one voice (SDD-62 §8.2.2, task 24): the project check drops a TypeScript diagnostic
 * that meets a fudic error of its file, and keeps every other one.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createProjectChecker, echoes, toPosix } from '../src/index.js';

describe('echoes: when two stretches meet', () => {
  const at = (start: number, end: number) => ({ start, end });

  it('they overlap', () => {
    expect(echoes(at(2, 6), [at(4, 9)])).toBe(true);
    expect(echoes(at(4, 9), [at(2, 6)])).toBe(true);
    // One inside the other.
    expect(echoes(at(3, 4), [at(0, 10)])).toBe(true);
  });

  it('they share a start or an end, which is how an empty one meets', () => {
    expect(echoes(at(3, 3), [at(3, 5)])).toBe(true);
    expect(echoes(at(5, 5), [at(3, 5)])).toBe(true);
    expect(echoes(at(3, 3), [at(3, 3)])).toBe(true);
  });

  it('touching end to start is not meeting, nor is an empty one outside', () => {
    expect(echoes(at(0, 3), [at(3, 5)])).toBe(false);
    expect(echoes(at(5, 8), [at(3, 5)])).toBe(false);
    expect(echoes(at(6, 6), [at(3, 5)])).toBe(false);
  });

  it('meets when any of the spoken stretches does, and never when none speaks', () => {
    expect(echoes(at(10, 12), [at(0, 1), at(11, 20)])).toBe(true);
    expect(echoes(at(10, 12), [])).toBe(false);
  });
});

describe('the project check says a fact once', () => {
  const roots: string[] = [];
  afterAll(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  });

  /** A project with `files` under `src/`, checked: `CODE text` for each problem of `file`. */
  function problemsOf(files: Readonly<Record<string, string>>, file: string): string[] {
    const root = toPosix(mkdtempSync(join(tmpdir(), 'fudic-one-voice-')));
    roots.push(root);
    mkdirSync(`${root}/src`, { recursive: true });
    writeFileSync(
      `${root}/tsconfig.json`,
      JSON.stringify({
        compilerOptions: { strict: true, skipLibCheck: true, module: 'ESNext', moduleResolution: 'bundler' },
        include: ['src/**/*.fud'],
      }),
    );
    for (const [name, text] of Object.entries(files)) writeFileSync(`${root}/src/${name}`, text);
    const text = files[file]!;
    return createProjectChecker({ root })
      .check()
      .problems.filter((p) => p.file === `${root}/src/${file}`)
      .map((p) => `${p.code} ${text.slice(p.span.start, p.span.end)}`);
  }

  const component = (tag: string, code: string, template: string): string =>
    `@code {\n${code}\n}\n\n<${tag}>\n  <template shadowrootmode="open">${template}</template>\n</${tag}>\n`;

  it('a name the view cannot read is FUD0907, and TypeScript does not say it again', () => {
    expect(problemsOf({ 'app-a.fud': component('app-a', '  const shown = 1;', '<p>@nope @shown</p>') }, 'app-a.fud')).toEqual([
      'FUD0907 nope',
    ]);
  });

  it('a TypeScript error no fudic error meets is still reported, beside the fudic one', () => {
    const problems = problemsOf(
      { 'app-b.fud': component('app-b', "  const n: number = 'x';\n  const shown = n;", '<p>@nope @shown</p>') },
      'app-b.fud',
    );
    expect(problems).toContain('TS2322 n');
    expect(problems).toContain('FUD0907 nope');
    expect(problems.filter((p) => p.endsWith(' nope'))).toEqual(['FUD0907 nope']);
  });
});
