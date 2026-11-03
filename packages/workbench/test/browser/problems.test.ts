/**
 * SDD-64 criteria 8–10, against a real Vite and a real browser: what stops a criterion is a
 * diagnostic with its code, and the report says where — the step in the `.fudspec`, or the
 * criterion when nothing ran. A `.fud` that does not compile is a problem with every one of its
 * errors, each in its place in the `.fud`.
 */

import { afterEach, describe, expect, it } from 'vitest';
import type { BenchMessage, ProblemMessage } from '../../src/protocol.js';
import type { CriterionReport } from '../../src/report-of.js';
import { runSpecs } from '../../src/run.js';
import { isFailure } from '../../src/types.js';
import { tempProject, type TempProject } from '../helpers/project.js';

let project: TempProject | undefined;

afterEach(() => {
  project?.remove();
  project = undefined;
});

/** Runs the `.fudspec` of `tag` in the temp project: its reports and every message. */
async function run(tag: string): Promise<{ reports: readonly CriterionReport[]; messages: BenchMessage[] }> {
  const messages: BenchMessage[] = [];
  const summary = await runSpecs([`src/components/${tag}.fudspec`], { root: project!.root, workers: 2, onMessage: (m) => messages.push(m) });
  if (isFailure(summary)) throw new Error(summary.diagnostic.message);
  return { reports: summary.reports, messages };
}

/** A `when` of the project: `body` is what its `run` does with `ctx` and `target`. */
const when = (name: string, body: string) =>
  `export const meta = { name: '${name}', block: 'when', params: [{ name: 'target', type: 'element' }] };\n` +
  `export async function run(ctx, { target }) {\n  ${body}\n  return { pass: true, evidence: 'done' };\n}\n` +
  'export const selfTest = [];\n';

const SPEC_FILE = 'src/components/app-slotted.fudspec';
const at = (line: number, column: number) => ({ file: SPEC_FILE, line, column });

describe('criterion 8 — a step that throws is an error with its code, at the step', () => {
  it('ambiguous (FUD1203), out of time (FUD1202), threw (FUD1204)', async () => {
    project = tempProject('problems-steps');
    project.write('fudic/terms/when/slow-click.js', when('slow-click', "await ctx.locate('role:button/\"Nowhere\"').click({ timeout: 100 });"));
    project.write('fudic/terms/when/explode.js', when('explode', "throw new Error('the term broke\\nstack');"));
    project.write(
      SPEC_FILE,
      'component app-slotted\n\n' +
        'criterion dos\n  then\n    visible role:link\n\n' + // lines 3–5
        'criterion lento\n  when\n    slow-click app-slotted\n  then\n    present app-slotted\n\n' + // lines 7–11
        'criterion roto\n  when\n    explode app-slotted\n  then\n    present app-slotted\n', // lines 13–17
    );
    const { reports, messages } = await run('app-slotted');
    expect(messages.flatMap((m) => (m.type === 'session' ? m.diagnostics : []))).toEqual([]);
    expect(reports.map((r) => [r.id, r.verdict])).toEqual([
      ['dos', 'error'],
      ['lento', 'error'],
      ['roto', 'error'],
    ]);
    const [dos, lento, roto] = reports;
    expect(dos!.broken).toMatchObject({ step: 'then  visible role:link', at: at(5, 5), diagnostics: [{ code: 'FUD1203', file: SPEC_FILE, line: 5, column: 5 }] });
    expect(dos!.broken!.diagnostics[0]!.message).toBe('"role:link" matches 2 elements: a step acts on one');
    expect(lento!.broken).toMatchObject({ step: 'when  slow-click app-slotted', at: at(9, 5), diagnostics: [{ code: 'FUD1202', line: 9, column: 5 }] });
    expect(roto!.broken).toMatchObject({ step: 'when  explode app-slotted', at: at(15, 5), diagnostics: [{ code: 'FUD1204', line: 15, column: 5 }] });
    expect(roto!.broken!.diagnostics[0]!.message).toBe('term "explode" threw: the term broke');
    for (const report of reports) expect(report).not.toHaveProperty('failed');
  }, 180_000);
});

describe('criterion 9 — the page and the project extension', () => {
  it('a component that throws in the page is FUD1205, one per error, with its first line', async () => {
    project = tempProject('problems-page');
    // A component comes alive on its first gesture: that is when its code runs, and throws.
    project.write(
      'src/components/app-crash.fud',
      '@code {\n  function go() {\n    throw new Error("crash while painting");\n  }\n}\n\n' +
        '<app-crash>\n  <template shadowrootmode="open">\n    <button @click=@go>crash</button>\n  </template>\n</app-crash>\n',
    );
    project.write('src/components/app-crash.fudspec', 'component app-crash\n\ncriterion pinta\n  when\n    click role:button\n  then\n    present app-crash\n');
    const { reports } = await run('app-crash');
    expect(reports[0]).toMatchObject({ id: 'pinta', verdict: 'error' });
    expect(reports[0]!.pageErrors.some((e) => e.includes('crash while painting'))).toBe(true);
    expect(reports[0]!.broken!.diagnostics).toContainEqual(expect.objectContaining({ code: 'FUD1205', file: null }));
    expect(reports[0]!.broken!.diagnostics.find((d) => d.code === 'FUD1205')!.message).toContain('crash while painting');
  }, 180_000);

  it('a fudic/bench.js that throws in its setup is FUD1206, naming the file', async () => {
    project = tempProject('problems-bench');
    project.write('fudic/bench.js', "export default { async setup() { throw new Error('no login for the bench'); } };\n");
    project.write('src/components/app-tabs.fudspec', 'component app-tabs\n\ncriterion abre\n  then\n    present app-tabs\n');
    const { reports } = await run('app-tabs');
    expect(reports[0]).toMatchObject({
      verdict: 'error',
      broken: { at: { file: 'src/components/app-tabs.fudspec', line: 3, column: 1 }, diagnostics: [{ code: 'FUD1206', file: 'fudic/bench.js' }] },
    });
    expect(reports[0]!.broken!.diagnostics[0]!.message).toContain('no login for the bench');
    expect(reports[0]!.broken).not.toHaveProperty('step');
  }, 180_000);
});

describe('criterion 10 — a .fud that does not compile, opened in the bench', () => {
  it('the problem carries every one of its errors, with code, file, line and column in the .fud', async () => {
    project = tempProject('problems-compile');
    project.write(
      'src/components/app-broken.fud',
      '<app-broken>\n  <template shadowrootmode="open">\n    <p>@(</p>\n    <p>@(</p>\n    <p>@(</p>\n  </template>\n</app-broken>\n',
    );
    project.write('src/components/app-broken.fudspec', 'component app-broken\n\ncriterion pinta\n  then\n    present app-broken\n');
    const { messages } = await run('app-broken');
    const problems = messages.filter((m): m is ProblemMessage => m.type === 'problem');
    expect(problems).toHaveLength(1);
    const { diagnostics, message } = problems[0]!;
    expect(message).toMatch(/^src\/components\/app-broken\.fud:3:\d+ - error FUD\d{4}/u);
    expect(diagnostics.length).toBeGreaterThanOrEqual(3);
    for (const d of diagnostics) {
      expect(d).toMatchObject({ code: expect.stringMatching(/^FUD\d{4}$/u), severity: 'error', file: 'src/components/app-broken.fud' });
    }
    // Every one, each at its own line: not only the first.
    expect([...new Set(diagnostics.map((d) => d.line))]).toEqual(expect.arrayContaining([3, 4, 5]));
  }, 180_000);
});
