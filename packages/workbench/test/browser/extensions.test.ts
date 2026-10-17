/**
 * SDD-59 §6.4 and §6.5, end to end on a throwaway project with `@fudic/terms` installed: the user
 * extends the workbench with `fudic/bench.js` and writes terms on what it adds, without touching
 * any package of fudic.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { openWorkbench } from '../../src/open.js';
import type { ResultMessage } from '../../src/protocol.js';
import { BENCH_FILE } from '../../src/runtime.js';
import { isFailure, type WorkbenchSession } from '../../src/types.js';
import { inbox, resultOf, type Inbox, type TempProject, tempProject } from '../helpers/project.js';

let project: TempProject | undefined;
let session: WorkbenchSession | undefined;

afterEach(async () => {
  await session?.close();
  project?.remove();
  session = undefined;
  project = undefined;
});

/** The extension of §3.3, as a user writes it. */
const BENCH_JS =
  "import { defineExtension } from '@fudic/terms';\n\n" +
  'export default defineExtension({\n' +
  '  async setup(page) {\n' +
  "    await page.emulateMedia({ colorScheme: 'dark' });\n" +
  "    await page.route('**/api/**', (route) => route.fulfill({ json: [] }));\n" +
  '  },\n' +
  '  context: (ctx) => ({\n' +
  '    ...ctx,\n' +
  '    async openMenu(ref) {\n' +
  '      const el = ctx.locate(ref);\n' +
  "      await ctx.act(el, () => el.press('Enter'));\n" +
  '    },\n' +
  '  }),\n' +
  '});\n';

/** A term of the project, on what its extension adds. */
const OPEN_MENU =
  "export const meta = { name: 'open-menu', block: 'when', params: [{ name: 'target', type: 'element' }] };\n" +
  'export async function run(ctx, { target }) {\n' +
  '  await ctx.openMenu(target);\n' +
  '  return { pass: true, evidence: `opened ${target}` };\n' +
  '}\n' +
  'export const selfTest = [];\n';

/** Reads the color scheme the page was set up with. */
const DARK =
  "export const meta = { name: 'dark', block: 'then', params: [] };\n" +
  'export async function run(ctx) {\n' +
  "  const dark = await ctx.page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches);\n" +
  "  return { pass: dark, evidence: dark ? 'dark' : 'light' };\n" +
  '}\n' +
  'export const selfTest = [];\n';

/** What the page receives from `/api/…`. */
const API =
  "export const meta = { name: 'api-answers', block: 'then', params: [{ name: 'path', type: 'token' }] };\n" +
  'export async function run(ctx, { path }) {\n' +
  '  const body = await ctx.page.evaluate((url) => fetch(url).then((r) => r.json()), path);\n' +
  '  return { pass: Array.isArray(body) && body.length === 0, evidence: JSON.stringify(body) };\n' +
  '}\n' +
  'export const selfTest = [];\n';

/** §6.5: a term that needs nothing the stock ctx does not give. */
const HAS_CLASS =
  "export const meta = { name: 'has-class', block: 'then', params: [{ name: 'target', type: 'element' }, { name: 'name', type: 'token' }] };\n" +
  'export async function run(ctx, { target, name }) {\n' +
  '  const classes = await ctx.locate(target).evaluate((el) => [...el.classList]);\n' +
  '  return { pass: classes.includes(name), evidence: { expected: name, actual: classes.join(" ") } };\n' +
  '}\n' +
  'export const selfTest = [];\n';

const BADGE =
  '<head>\n  <style>\n    span { padding: 2px; }\n  </style>\n</head>\n\n' +
  '<app-badge>\n  <template shadowrootmode="open">\n    <span role="status" class="badge pill">new</span>\n  </template>\n</app-badge>\n';

const TABS = 'src/components/app-tabs.fud';

/** Opens `component` of a fresh project with `files`, and waits for the results of `ids`. */
async function open(
  component: string,
  spec: string,
  ids: readonly string[],
  files: Record<string, string>,
): Promise<{ results: ResultMessage[]; box: Inbox; s: WorkbenchSession }> {
  project = tempProject('extensions');
  for (const [file, content] of Object.entries(files)) project.write(file, content);
  project.write(component.replace(/\.fud$/u, '.fudspec'), spec);
  const box = inbox();
  const answer = await openWorkbench(project.path(component), { onMessage: box.onMessage });
  if (isFailure(answer)) throw new Error(answer.diagnostic.message);
  session = answer;
  const results = await Promise.all(ids.map((id) => box.next(resultOf(id), 0, 60_000)));
  return { results, box, s: answer };
}

const OPENS = 'component app-tabs\n\ncriterion abre\n  when\n    open-menu role:tab/"Tab B"\n  then\n    text role:tabpanel "panel B"\n';

describe('SDD-59 §6.4 — the user extends the workbench without touching fudic', () => {
  it('1. a term of the project on ctx.openMenu of fudic/bench.js runs green', async () => {
    const { results } = await open(TABS, OPENS, ['abre'], {
      [BENCH_FILE]: BENCH_JS,
      'fudic/terms/when/open-menu.js': OPEN_MENU,
    });
    expect(results[0]).toMatchObject({ verdict: 'pass' });
    expect(results[0]!.steps.map((s) => ('pass' in s ? s.evidence : s.error))).toEqual([
      'opened role:tab/"Tab B"',
      { expected: 'panel B', actual: 'panel B' },
    ]);
  }, 90_000);

  it('1. without fudic/bench.js, the same term is in error: ctx.openMenu is not a function', async () => {
    const { results } = await open(TABS, OPENS, ['abre'], { 'fudic/terms/when/open-menu.js': OPEN_MENU });
    expect(results[0]).toMatchObject({ verdict: 'error' });
    expect(results[0]!.steps).toEqual([
      { block: 'when', term: 'open-menu', layer: 'workspace', args: ['role:tab/"Tab B"'], error: 'ctx.openMenu is not a function' },
    ]);
  }, 90_000);

  it('2. its setup applies before the mount: the page is dark, and /api/… answers []', async () => {
    const { results } = await open(
      TABS,
      'component app-tabs\n\ncriterion entorno\n  then\n    dark\n    api-answers /api/items\n',
      ['entorno'],
      { [BENCH_FILE]: BENCH_JS, 'fudic/terms/then/dark.js': DARK, 'fudic/terms/then/api-answers.js': API },
    );
    expect(results[0]).toMatchObject({ verdict: 'pass' });
    expect(results[0]!.steps.map((s) => ('pass' in s ? s.evidence : s.error))).toEqual(['dark', '[]']);
  }, 90_000);

  it('2. without it, the page is light', async () => {
    const { results } = await open(TABS, 'component app-tabs\n\ncriterion entorno\n  then\n    dark\n', ['entorno'], {
      'fudic/terms/then/dark.js': DARK,
    });
    expect(results[0]).toMatchObject({ verdict: 'fail', steps: [{ pass: false, evidence: 'light' }] });
  }, 90_000);

  it('3. a fudic/bench.js that throws while loading is an error of every criterion, with its message and path; the workbench lives on', async () => {
    const { results, box, s } = await open(
      TABS,
      'component app-tabs\n\ncriterion a\n  then\n    visible app-tabs\n\ncriterion b\n  then\n    visible role:tabpanel\n',
      ['a', 'b'],
      { [BENCH_FILE]: "import { defineExtension } from '@fudic/terms';\nthrow new Error('the bench is broken');\nexport default defineExtension({});\n" },
    );
    const error = `${project!.path(BENCH_FILE)}: the bench is broken`;
    expect(results.map((r) => [r.id, r.verdict, r.error])).toEqual([
      ['a', 'error', error],
      ['b', 'error', error],
    ]);
    // Still alive: it answers the next run.
    const from = box.messages.length;
    s.command({ v: 2, type: 'run', tag: 'app-tabs', ids: ['a'] });
    expect(await box.next(resultOf('a'), from, 60_000)).toMatchObject({ verdict: 'error', error });
  }, 90_000);
});

describe('SDD-59 §6.5 — a new term without touching the workbench', () => {
  it('then/has-class reads classList through ctx.locate(t).evaluate', async () => {
    const { results } = await open(
      'src/components/app-badge.fud',
      'component app-badge\n\ncriterion pildora\n  then\n    has-class role:status pill\n\ncriterion otra\n  then\n    has-class role:status round\n',
      ['pildora', 'otra'],
      { 'src/components/app-badge.fud': BADGE, 'fudic/terms/then/has-class.js': HAS_CLASS },
    );
    expect(results[0]).toMatchObject({ verdict: 'pass', steps: [{ evidence: { expected: 'pill', actual: 'badge pill' } }] });
    expect(results[1]).toMatchObject({ verdict: 'fail', steps: [{ pass: false, evidence: { expected: 'round', actual: 'badge pill' } }] });
    // The stock locate marks the element it read, for the shot.
    expect(results[0]!.marks.map((m) => m.ref)).toEqual(['role:status']);
  }, 90_000);
});
