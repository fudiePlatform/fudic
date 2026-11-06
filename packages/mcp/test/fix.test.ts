/**
 * `fudic_fix` (SDD-77 §4.5, §8.2.22, criterion 13): the repairs with one option, applied and
 * checked again, at most five rounds. First its rules with a scripted check over real files, then
 * the tool over a client on what `fudic new` writes.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import * as cli from '@fudic/cli';
import type { Repair } from '@fudic/language-server/project';
import type { CheckProblem, CheckReport } from '@fudic/typecheck';
import type { Checks } from '../src/checks.js';
import { fixProject, ROUNDS } from '../src/fix.js';
import { openProject } from '../src/project.js';
import { createServer } from '../src/server.js';
import { connect, newApp, tempDir } from './helpers.js';

let dir: ReturnType<typeof tempDir>;

beforeEach(() => {
  dir = tempDir({ 'fudic.json': '{}', 'a.fud': 'aaa bbb ccc\n' });
});

afterEach(() => {
  dir.dispose();
});

const A = (): string => join(dir.root, 'a.fud');

const problem = (code: string, start = 0, file = A()): CheckProblem => ({ file, span: { start, end: start + 1 }, severity: 'error', code, message: `${code} message` });

const edit = (start: number, end: number, newText: string, path = A()): Repair['edits'][number] => ({ path, span: { start, end }, newText });

/**
 * A check that answers the reports in turn — the last one from then on — and the repairs of
 * each code, as the editor would.
 */
function scripted(reports: readonly (readonly CheckProblem[])[], repairs: Readonly<Record<string, readonly Repair[]>>): Checks & { runs: number } {
  const state = {
    runs: 0,
    run(): Promise<CheckReport> {
      const problems = reports[Math.min(state.runs, reports.length - 1)]!;
      state.runs += 1;
      return Promise.resolve({ problems, project: [], inputs: [] });
    },
    repairs: (p: CheckProblem) => Promise.resolve(repairs[p.code] ?? []),
    fudic: () => Promise.resolve({ cli }),
  };
  return state as unknown as Checks & { runs: number };
}

const repair = (code: string, title: string, edits: Repair['edits']): Repair => ({ code: code as Repair['code'], title, edits });

const fix = (checks: Checks, input: Partial<Parameters<typeof fixProject>[2]> = {}): ReturnType<typeof fixProject> =>
  fixProject(openProject(dir.root, () => 'x'), checks, { dryRun: false, ...input });

const text = (): string => readFileSync(A(), 'utf8');

describe('fixProject', () => {
  it('a folder with no fudic project: FUD1404', async () => {
    const plain = tempDir();
    try {
      const answer = await fixProject(openProject(plain.root, () => 'x'), scripted([[]], {}), { dryRun: false });
      expect(answer.failed).toBe(true);
      expect(answer.diagnostics?.map((d) => d.code)).toEqual(['FUD1404']);
    } finally {
      plain.dispose();
    }
  });

  it('a path out of the project: FUD1400, and nothing runs', async () => {
    const checks = scripted([[]], {});
    const answer = await fix(checks, { paths: ['../x'] });
    expect(answer.diagnostics?.map((d) => d.code)).toEqual(['FUD1400']);
    expect(checks.runs).toBe(0);
  });

  it('applies, checks again, and applies what the repair uncovered; stops when nothing has one repair', async () => {
    const checks = scripted([[problem('FUD0001', 0)], [problem('FUD0002', 4)], []], {
      FUD0001: [repair('FUD0001', 'Upper a', [edit(0, 3, 'AAA')])],
      FUD0002: [repair('FUD0002', 'Upper b', [edit(4, 7, 'BBB')])],
    });
    const answer = await fix(checks);
    expect(text()).toBe('AAA BBB ccc\n');
    expect(answer.body['applied']).toEqual([
      { code: 'FUD0001', at: 'a.fud:1:1', title: 'Upper a' },
      { code: 'FUD0002', at: 'a.fud:1:5', title: 'Upper b' },
    ]);
    // One diff per file, from before the first round to the end.
    expect(answer.body['diff']).toBe(cli.formatDiff({ kind: 'modify', path: 'a.fud', contents: 'AAA BBB ccc\n', before: 'aaa bbb ccc\n' }).join('\n'));
    expect(answer.body['summary']).toEqual({ errors: 0, warnings: 0, fixable: 0, files: 0 });
    expect(answer.next).toBeNull();
    // Three rounds, the last finding nothing, and the check of what is left.
    expect(checks.runs).toBe(4);
  });

  it('two repairs that touch the same text: the second waits for the next round', async () => {
    const first = repair('FUD0001', 'One', [edit(0, 3, 'x')]);
    const second = repair('FUD0002', 'Two', [edit(2, 5, 'y')]);
    const checks = scripted([[problem('FUD0001', 0), problem('FUD0002', 2)], [problem('FUD0002', 0)], []], { FUD0001: [first], FUD0002: [second] });
    const answer = await fix(checks, { dryRun: true });
    expect((answer.body['applied'] as { code: string }[]).map((a) => a.code)).toEqual(['FUD0001']);
  });

  it('edits that do not touch go in one round, the later first so the offsets hold', async () => {
    const checks = scripted([[problem('FUD0001', 0), problem('FUD0002', 8)], []], {
      FUD0001: [repair('FUD0001', 'a', [edit(0, 3, 'A')])],
      FUD0002: [repair('FUD0002', 'c', [edit(8, 11, 'CCCCC')])],
    });
    await fix(checks);
    expect(text()).toBe('A bbb CCCCC\n');
  });

  it('what has no repair, or several, is left: several carry their options', async () => {
    const checks = scripted([[problem('FUD0001'), problem('FUD0002', 4)]], {
      FUD0002: [repair('FUD0002', 'One way', [edit(4, 7, '1')]), repair('FUD0002', 'Another', [edit(4, 7, '2')])],
    });
    const answer = await fix(checks);
    expect(answer.body['applied']).toEqual([]);
    expect(answer.body['diff']).toBe('');
    expect(text()).toBe('aaa bbb ccc\n');
    expect(answer.diagnostics?.map((d) => [d.code, (d as { options?: readonly string[] }).options])).toEqual([
      ['FUD0001', undefined],
      ['FUD0002', ['One way', 'Another']],
    ]);
    expect(answer.next).toBe('Fix FUD0001 at a.fud:1:1, then run fudic_check again.');
  });

  it('only the codes asked for, and only under the paths asked for', async () => {
    const other = join(dir.root, 'src', 'b.fud');
    mkdirSync(join(dir.root, 'src'));
    writeFileSync(other, 'zzz\n');
    const repairs = {
      FUD0001: [repair('FUD0001', 'a', [edit(0, 3, 'A')])],
      FUD0002: [repair('FUD0002', 'b', [edit(4, 7, 'B')])],
      FUD0003: [repair('FUD0003', 'z', [edit(0, 3, 'Z', other)])],
    };
    const report = [problem('FUD0001', 0), problem('FUD0002', 4), problem('FUD0003', 0, other)];
    const byCode = await fix(scripted([report, []], repairs), { codes: ['FUD0002', 'FUD0003'], dryRun: true });
    expect((byCode.body['applied'] as { code: string }[]).map((a) => a.code)).toEqual(['FUD0002', 'FUD0003']);
    const byPath = await fix(scripted([report], repairs), { paths: ['src'], dryRun: true });
    expect((byPath.body['applied'] as { code: string }[]).map((a) => a.code)).toEqual(['FUD0003']);
    // The list is narrowed as fudic_check narrows it; the summary counts everything.
    expect(byPath.diagnostics?.map((d) => d.code)).toEqual(['FUD0003']);
    expect(byPath.body['summary']).toMatchObject({ errors: 3 });
  });

  it('a dry run: one round, its diff, and nothing written', async () => {
    const checks = scripted([[problem('FUD0001', 0)], [problem('FUD0002', 4)], []], {
      FUD0001: [repair('FUD0001', 'a', [edit(0, 3, 'AAA')])],
      FUD0002: [repair('FUD0002', 'b', [edit(4, 7, 'BBB')])],
    });
    const answer = await fix(checks, { dryRun: true });
    expect(text()).toBe('aaa bbb ccc\n');
    expect((answer.body['applied'] as { code: string }[]).map((a) => a.code)).toEqual(['FUD0001']);
    expect(answer.body['diff']).toBe(cli.formatDiff({ kind: 'modify', path: 'a.fud', contents: 'AAA bbb ccc\n', before: 'aaa bbb ccc\n' }).join('\n'));
  });

  it(`at most ${ROUNDS} rounds, whatever keeps coming`, async () => {
    const checks = scripted([[problem('FUD0001', 0)]], { FUD0001: [repair('FUD0001', 'again', [edit(0, 0, '+')])] });
    const answer = await fix(checks);
    expect(ROUNDS).toBe(5);
    expect(answer.body['applied']).toHaveLength(5);
    expect(text()).toBe('+++++aaa bbb ccc\n');
  });

  it('a repair that creates a file starts from nothing', async () => {
    const created = join(dir.root, 'new.fud');
    const checks = scripted([[problem('FUD0001', 0)], []], { FUD0001: [repair('FUD0001', 'create', [edit(0, 0, 'hello\n', created)])] });
    const answer = await fix(checks);
    expect(readFileSync(created, 'utf8')).toBe('hello\n');
    expect(answer.body['diff']).toContain('+hello');
  });
});

describe('fudic_fix over a client, on a new app (criterion 13)', () => {
  let app: Awaited<ReturnType<typeof newApp>>;
  let client: Client;

  const BADGE = '<app-badge>\n  <template shadowrootmode="open"><span>x</span></template>\n</app-badge>\n';
  const LIST = [
    '@code {',
    '  type Item = { readonly name: string };',
    '  const { items = [] } = props<{ items?: readonly Item[] }>();',
    '}',
    '',
    '<app-list>',
    '  <template shadowrootmode="open">',
    '    <app-badge></app-badge>',
    '    <ul>',
    '      @foreach (const item of items) {',
    '        <li>@item.name</li>',
    '      }',
    '    </ul>',
    '  </template>',
    '</app-list>',
    '',
  ].join('\n');
  const LIST_FILE = 'src/components/app-list/app-list.fud';

  beforeAll(async () => {
    app = await newApp();
    mkdirSync(join(app.root, 'src', 'components', 'app-list'), { recursive: true });
    mkdirSync(join(app.root, 'src', 'components', 'app-badge'), { recursive: true });
    writeFileSync(join(app.root, 'src', 'components', 'app-badge', 'app-badge.fud'), BADGE);
    writeFileSync(join(app.root, LIST_FILE), LIST);
    client = await connect(createServer({ project: openProject(app.root, () => 'b59fa7d'), entry: 'stdio' }));
  }, 120_000);

  afterAll(async () => {
    await client.close();
    app.dispose();
  });

  const call = async (args: Record<string, unknown>): Promise<Record<string, unknown>> =>
    (await client.callTool({ name: 'fudic_fix', arguments: args })).structuredContent as Record<string, unknown>;

  it('a dry run says what it would apply and writes nothing', async () => {
    const answer = await call({ dryRun: true });
    expect(answer['applied']).toEqual([{ code: 'FUD0191', at: `${LIST_FILE}:8:5`, title: 'Add <link rel="component"> for <app-badge>' }]);
    expect(answer['diff']).toContain('+<link rel="component" href="../app-badge/app-badge.fud">');
    expect(readFileSync(join(app.root, LIST_FILE), 'utf8')).toBe(LIST);
  }, 120_000);

  it('fixes FUD0191 on disk and leaves FUD0540 over an object without id, which has no repair', async () => {
    const answer = await call({});
    expect((answer['applied'] as { code: string }[]).map((a) => a.code)).toEqual(['FUD0191']);
    expect(readFileSync(join(app.root, LIST_FILE), 'utf8')).toContain('<link rel="component" href="../app-badge/app-badge.fud">');
    const left = answer['diagnostics'] as { code: string; fixable: boolean; options?: unknown }[];
    expect(left.map((d) => [d.code, d.fixable, d.options])).toEqual([['FUD0540', false, undefined]]);
    expect(answer['summary']).toMatchObject({ errors: 1, fixable: 0 });
    expect(answer['next']).toBe(`Fix FUD0540 at ${LIST_FILE}:11:16, then run fudic_check again.`);
    // Nothing left with one repair: a second run applies nothing.
    expect((await call({}))['applied']).toEqual([]);
  }, 120_000);
});
