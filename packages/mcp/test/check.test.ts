/**
 * `fudic_check` (SDD-77 §4.1, criterion 12): what the build would say, without building. The
 * pieces on their own, then the tool over a client, on what `fudic new` writes.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { FUD0870, FUD1406 } from '@fudic/diagnostics';
import type { CheckProblem, CheckReport } from '@fudic/typecheck';
import { checkProject, inside, located, nextOf, problemsOf, summaryOf } from '../src/check.js';
import type { Checks } from '../src/checks.js';
import type { Problem } from '../src/diagnostics.js';
import { openProject } from '../src/project.js';
import { createServer } from '../src/server.js';
import { connect, newApp, tempDir } from './helpers.js';

const at = (file: string, code: string, severity: 'error' | 'warning' = 'error', start = 0): CheckProblem => ({
  file,
  span: { start, end: start + 1 },
  severity,
  code,
  message: `${code} message`,
});

/** A `Checks` that answers a fixed report, and a number of repairs per code. */
function fakeChecks(report: CheckReport, repairs: Readonly<Record<string, number>> = {}): Checks {
  return {
    run: () => Promise.resolve(report),
    repairs: (p: CheckProblem) => Promise.resolve(Array.from({ length: repairs[p.code] ?? 0 }, (_, i) => ({ title: `${p.code} option ${i + 1}`, edits: [] }))),
  } as unknown as Checks;
}

describe('problemsOf', () => {
  it('the project\'s errors and warnings first; fixable is exactly one repair; several are options', async () => {
    const report: CheckReport = {
      problems: [at('/p/a.fud', 'FUD0191'), at('/p/a.fud', 'FUD0540'), at('/p/b.ts', 'TS2322')],
      project: [FUD0870(), { ...FUD1406(), severity: 'info' }],
      inputs: [],
    };
    const problems = await problemsOf(report, fakeChecks(report, { FUD0191: 1, FUD0540: 2 }));
    expect(problems.map((p) => [p.code, p.fixable, p.options])).toEqual([
      ['FUD0870', undefined, undefined],
      ['FUD0191', true, undefined],
      ['FUD0540', false, ['FUD0540 option 1', 'FUD0540 option 2']],
      ['TS2322', false, undefined],
    ]);
  });
});

describe('problemsOf — a manual repair (SDD-79 §8.2.13)', () => {
  it('is an option, never fixable', async () => {
    const report: CheckReport = { problems: [at('/p/a.fud', 'FUD1441', 'warning'), at('/p/a.fud', 'FUD1440', 'warning')], project: [], inputs: [] };
    const checks = {
      run: () => Promise.resolve(report),
      repairs: (p: CheckProblem) =>
        Promise.resolve([{ title: `${p.code} repair`, edits: [], ...(p.code === 'FUD1441' ? { manual: true } : {}) }]),
    } as unknown as Checks;
    const problems = await problemsOf(report, checks);
    expect(problems.map((p) => [p.code, p.fixable, p.options])).toEqual([
      ['FUD1441', false, ['FUD1441 repair']],
      ['FUD1440', true, undefined],
    ]);
  });
});

describe('inside and located', () => {
  it('a problem of the project is always listed; one of a file, when under what was asked', () => {
    const project: Problem = { code: 'FUD0870', severity: 'error', message: 'x' };
    expect(inside(project, ['/p/src'])).toBe(true);
    expect(inside(at('/p/src/a.fud', 'X'), [])).toBe(true);
    expect(inside(at('/p/src/a.fud', 'X'), [join('/p', 'src')])).toBe(true);
    expect(inside(at('/p/src/a.fud', 'X'), [join('/p', 'src', 'a.fud')])).toBe(true);
    expect(inside(at('/p/src/a.fud', 'X'), [join('/p', 'lib'), join('/p', 'src', 'b.fud')])).toBe(false);
    expect(inside(at('/q/a.fud', 'X'), [join('/p')])).toBe(false);
  });

  it('every path asked, absolute; the first one that is refused is the answer', () => {
    const dir = tempDir();
    try {
      expect(located(dir.root)).toEqual({ under: [] });
      expect(located(dir.root, ['src', 'lib/a.fud'])).toEqual({ under: [join(dir.root, 'src'), join(dir.root, 'lib', 'a.fud')] });
      expect(located(dir.root, ['src', '../x', '.git'])).toEqual({ error: expect.objectContaining({ code: 'FUD1400', file: '../x' }) });
    } finally {
      dir.dispose();
    }
  });
});

describe('summaryOf', () => {
  it('counts everything, whatever the list shows', () => {
    const problems: Problem[] = [
      { ...at('/p/a.fud', 'A'), fixable: true },
      at('/p/a.fud', 'B'),
      at('/p/b.fud', 'C', 'warning'),
      { code: 'FUD0870', severity: 'error', message: 'x' },
    ];
    expect(summaryOf(problems)).toEqual({ errors: 3, warnings: 1, fixable: 1, files: 2 });
  });
});

describe('nextOf', () => {
  const dir = tempDir({ 'a.fud': '<p>\n  @foreach (const x of xs) {\n' });
  afterAll(() => dir.dispose());

  it('no error: null, warnings or not', () => {
    expect(nextOf([], dir.root)).toBeNull();
    expect(nextOf([at(join(dir.root, 'a.fud'), 'W', 'warning')], dir.root)).toBeNull();
  });

  it('with fixable errors: fudic_fix, counting them', () => {
    const problems: Problem[] = [{ ...at(join(dir.root, 'a.fud'), 'A'), fixable: true }, { ...at(join(dir.root, 'a.fud'), 'B'), fixable: true }, at(join(dir.root, 'a.fud'), 'C')];
    expect(nextOf(problems, dir.root)).toBe('Run fudic_fix for the 2 fixable diagnostics, then fix the rest by hand.');
  });

  it('otherwise the first error, by its place', () => {
    expect(nextOf([at(join(dir.root, 'a.fud'), 'FUD0540', 'error', 6)], dir.root)).toBe('Fix FUD0540 at a.fud:2:3, then run fudic_check again.');
  });

  it('an error of the project has no place to name', () => {
    expect(nextOf([{ code: 'FUD0870', severity: 'error', message: 'x' }], dir.root)).toBe('Fix FUD0870, then run fudic_check again.');
  });
});

describe('checkProject', () => {
  it('a folder that is no fudic project: FUD1404, as a failure', async () => {
    const dir = tempDir();
    try {
      const answer = await checkProject(openProject(dir.root, () => 'x'), fakeChecks({ problems: [], project: [], inputs: [] }), { limit: 20 });
      expect(answer.failed).toBe(true);
      expect(answer.diagnostics?.map((d) => d.code)).toEqual(['FUD1404']);
    } finally {
      dir.dispose();
    }
  });

  it('a fudic.json above the folder makes it one', async () => {
    const dir = tempDir({ 'fudic.json': '{}' });
    try {
      mkdirSync(join(dir.root, 'libs', 'ui'), { recursive: true });
      const answer = await checkProject(openProject(join(dir.root, 'libs', 'ui'), () => 'x'), fakeChecks({ problems: [], project: [], inputs: [] }), { limit: 20 });
      expect(answer).toEqual({ body: { summary: { errors: 0, warnings: 0, fixable: 0, files: 0 } }, diagnostics: [], next: null });
    } finally {
      dir.dispose();
    }
  });

  it('a path out of the project: FUD1400, and nothing is checked', async () => {
    const dir = tempDir({ 'fudic.json': '{}' });
    try {
      let ran = false;
      const checks = { run: () => ((ran = true), Promise.resolve({ problems: [], project: [], inputs: [] })), repairs: () => Promise.resolve([]) } as unknown as Checks;
      const answer = await checkProject(openProject(dir.root, () => 'x'), checks, { paths: ['src', '../elsewhere'], limit: 20 });
      expect(answer.failed).toBe(true);
      expect(answer.diagnostics?.map((d) => d.code)).toEqual(['FUD1400']);
      expect(ran).toBe(false);
    } finally {
      dir.dispose();
    }
  });

  it('paths narrow the list, never the summary; limit cuts the list', async () => {
    const dir = tempDir({ 'fudic.json': '{}' });
    try {
      const a = join(dir.root, 'src', 'a.fud');
      const b = join(dir.root, 'lib', 'b.fud');
      const report: CheckReport = { problems: [at(a, 'X1'), at(a, 'X2'), at(b, 'X3')], project: [], inputs: [] };
      const project = openProject(dir.root, () => 'x');
      const narrowed = await checkProject(project, fakeChecks(report), { paths: ['src'], limit: 20 });
      expect(narrowed.diagnostics?.map((d) => d.code)).toEqual(['X1', 'X2']);
      expect(narrowed.body).toEqual({ summary: { errors: 3, warnings: 0, fixable: 0, files: 2 } });
      const cut = await checkProject(project, fakeChecks(report), { limit: 1 });
      expect(cut.diagnostics?.map((d) => d.code)).toEqual(['X1']);
      expect(cut.body).toEqual(narrowed.body);
      expect(cut.next).toBe('Fix X1 at src/a.fud, then run fudic_check again.');
    } finally {
      dir.dispose();
    }
  });
});

describe('fudic_check over a client, on a new app (criterion 12)', () => {
  let app: Awaited<ReturnType<typeof newApp>>;
  let client: Client;

  const CARD = [
    '@code {',
    '  type Item = { readonly name: string };',
    '  const { items = [] } = props<{ items?: readonly Item[] }>();',
    '  const count: number = "many";',
    '}',
    '',
    '<app-card>',
    '  <template shadowrootmode="open">',
    '    <ul>',
    '      @foreach (const item of items) {',
    '        <li>@item.name</li>',
    '      }',
    '    </ul>',
    '    <p>@count</p>',
    '  </template>',
    '</app-card>',
    '',
  ].join('\n');

  beforeAll(async () => {
    app = await newApp();
    mkdirSync(join(app.root, 'src', 'components', 'app-card'), { recursive: true });
    writeFileSync(join(app.root, 'src', 'components', 'app-card', 'app-card.fud'), CARD);
    client = await connect(createServer({ project: openProject(app.root, () => 'b59fa7d'), entry: 'stdio' }));
  }, 120_000);

  afterAll(async () => {
    await client.close();
    app.dispose();
  });

  const call = async (args: Record<string, unknown>): Promise<Record<string, unknown>> =>
    (await client.callTool({ name: 'fudic_check', arguments: args })).structuredContent as Record<string, unknown>;

  it('both, in order of place, with at and quote; the why only for the fudic code', async () => {
    const answer = await call({});
    expect(answer['fudicVersion']).toEqual(expect.any(String));
    const diagnostics = answer['diagnostics'] as { code: string; at: string; quote: string }[];
    expect(diagnostics.map((d) => [d.code, d.at, d.quote])).toEqual([
      ['TS2322', 'src/components/app-card/app-card.fud:4:9', 'const count: number = "many";'],
      ['FUD0540', 'src/components/app-card/app-card.fud:10:16', '@foreach (const item of items) {'],
    ]);
    expect(Object.keys(answer['codes'] as object)).toEqual(['FUD0540']);
    expect(answer['summary']).toMatchObject({ errors: 2, warnings: 0, files: 1 });
    expect(answer['next']).toEqual(expect.any(String));
  }, 120_000);

  it('limit: 1 cuts the list and not the summary', async () => {
    const all = await call({});
    const one = await call({ limit: 1 });
    expect(one['diagnostics']).toHaveLength(1);
    expect(one['summary']).toEqual(all['summary']);
  }, 120_000);

  it('the same call twice is the same answer, byte for byte', async () => {
    expect(JSON.stringify(await call({ paths: ['src'] }))).toBe(JSON.stringify(await call({ paths: ['src'] })));
  }, 120_000);

  it('a path out of the project is refused as an error', async () => {
    const result = await client.callTool({ name: 'fudic_check', arguments: { paths: ['../x'] } });
    expect(result.isError).toBe(true);
    expect((result.structuredContent as { diagnostics: { code: string }[] }).diagnostics.map((d) => d.code)).toEqual(['FUD1400']);
  });
});

describe('fudic_check under the policy of the project (SDD-83 criterion 36)', () => {
  let app: Awaited<ReturnType<typeof newApp>>;

  const DAYS = [
    '@code {',
    '  const days = [1, 2];',
    '  function pick(n: number): void { console.log(n); }',
    '}',
    '<app-days>',
    '  <template shadowrootmode="open">',
    '    @foreach (const n of days) key (n) {',
    '      <button @click=@pick(n)>@n</button>',
    '    }',
    '  </template>',
    '</app-days>',
    '',
  ].join('\n');

  beforeAll(async () => {
    app = await newApp();
    mkdirSync(join(app.root, 'src', 'components', 'app-days'), { recursive: true });
    writeFileSync(join(app.root, 'src', 'components', 'app-days', 'app-days.fud'), DAYS);
  }, 120_000);

  afterAll(() => app.dispose());

  /** The diagnostics of a check, with `diagnostics` as the policy of the app's fudic.json. */
  const check = async (diagnostics: Record<string, string>): Promise<{ code: string; severity: string; message: string }[]> => {
    const file = join(app.root, 'fudic.json');
    const config = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    writeFileSync(file, JSON.stringify({ ...config, diagnostics }, null, 2));
    const client = await connect(createServer({ project: openProject(app.root, () => 'b59fa7d'), entry: 'stdio' }));
    try {
      const answer = (await client.callTool({ name: 'fudic_check', arguments: {} })).structuredContent as Record<string, unknown>;
      return answer['diagnostics'] as { code: string; severity: string; message: string }[];
    } finally {
      await client.close();
    }
  };

  it('a warning as it is, raised to an error with the message saying so, and off', async () => {
    expect((await check({})).map((d) => [d.code, d.severity])).toEqual([['FUD1380', 'warning']]);
    const [raised] = await check({ FUD1380: 'error' });
    expect(raised).toMatchObject({ code: 'FUD1380', severity: 'error' });
    expect(raised!.message).toMatch(/\(warning by default; error in this project\)$/u);
    expect(await check({ FUD1380: 'off' })).toEqual([]);
  }, 240_000);
});
