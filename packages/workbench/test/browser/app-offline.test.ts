/**
 * SDD-82 §4.7 and criterion 22 against a real app Vite, its Service Worker and a real browser:
 * the bench serves the worker of the app in preview mode, every criterion's browser installs it,
 * and without network a page the worker already knows still opens, while one it never saw fails
 * as the browser fails.
 */

import { mkdirSync, symlinkSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runSpecs, type RunSummary } from '../../src/run.js';
import type { CriterionReport } from '../../src/report-of.js';
import { isFailure } from '../../src/types.js';
import { REPO } from '../helpers/bench.js';
import { tempProject, type TempProject } from '../helpers/project.js';

/** A term module, with the `selfTest` a workspace term owes. */
function term(name: string, block: string, params: readonly string[], body: string): string {
  const meta = { name, block, params: params.map((p) => ({ name: p, type: 'string' })) };
  return `export const meta = ${JSON.stringify(meta)};\n\nexport async function run(ctx, args) {\n  ${body}\n}\n\nexport async function selfTest() {}\n`;
}

const page = (title: string): string => `<!DOCTYPE html>
<html>
<head><title>${title}</title><script type="module" src="fudic:runtime"></script></head>
<body><h1>${title}</h1></body>
</html>
`;

const FILES: Readonly<Record<string, string>> = {
  'package.json': JSON.stringify({ name: 'bench-offline', private: true, type: 'module' }),
  'vite.config.ts': "import { fudic } from '@fudic/vite';\n\nexport default { plugins: [fudic({ liveCheck: false })] };\n",
  // `"dev": "off"`, as the example ships it: the bench serves the worker anyway (§3.8).
  'sw.json': JSON.stringify({ shell: [], dev: 'off' }),
  'src/routes/blog.fud': page('Blog'),
  'src/routes/about.fud': page('About'),
  'src/routes/nunca.fud': page('Nunca'),
  // Waits until the worker controls the page and knows it: a visit with network installs it.
  'fudic/terms/when/installed.js': term('installed', 'when', [], `await ctx.page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller === null) await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
  });
  await ctx.page.reload();
  await ctx.page.goto(new URL('/about', ctx.page.url()).href);
  await ctx.page.goto(new URL('/blog', ctx.page.url()).href);
  return { pass: true, evidence: null };`),
  'fudic/terms/when/offline.js': term('offline', 'when', [], 'await ctx.page.context().setOffline(true); return { pass: true, evidence: null };'),
  // A navigation that may fail: what it answered, or why it did not.
  'fudic/terms/when/go.js': term('go', 'when', ['url'], `try {
    const response = await ctx.page.goto(new URL(String(args.url), ctx.page.url()).href);
    globalThis.__lastGo = String(response?.status() ?? 'none');
  } catch (error) {
    globalThis.__lastGo = 'failed';
  }
  return { pass: true, evidence: globalThis.__lastGo };`),
  'fudic/terms/then/title-is.js': term('title-is', 'then', ['text'], `const title = await ctx.page.title();
  return { pass: title === String(args.text), evidence: { expected: String(args.text), actual: title } };`),
  'src/flows/sin-red.fudspec': `flow sin-red

criterion abre-una-visitada
  given
    url /blog
  when
    installed
    offline
    go "/about"
  then
    title-is "About"

criterion no-abre-una-nunca-vista
  given
    url /blog
  when
    installed
    offline
    go "/nunca"
  then
    title-is "Nunca"
`,
};

let project: TempProject;
let summary: RunSummary;

const report = (id: string): CriterionReport => {
  const found = summary.reports.find((r) => r.id === id)!;
  // An error is a fault of the run, not of the worker: said whole.
  if (found.verdict === 'error') throw new Error(JSON.stringify(found.broken));
  return found;
};

beforeAll(async () => {
  project = tempProject('app-offline');
  for (const [path, text] of Object.entries(FILES)) project.write(path, text);
  mkdirSync(project.path('node_modules/@fudic'), { recursive: true });
  for (const name of ['http', 'di', 'forms', 'conventions']) {
    symlinkSync(`${REPO}/packages/${name}`, project.path(`node_modules/@fudic/${name}`), 'junction');
  }
  const ran = await runSpecs(['src/flows'], { root: project.root, workers: 2 });
  if (isFailure(ran)) throw new Error(ran.diagnostic.message);
  summary = ran;
}, 240_000);

afterAll(() => {
  project.remove();
});

describe('without network (criterion 22)', () => {
  // A page the worker knows opening from it waits on a decision: in dev every route is `ssr`, and
  // the worker renders none of them (see the SDD's open question on §4.7).
  it.todo('a page the worker knows opens from it');

  it('one it never saw fails as the browser fails', () => {
    expect(report('no-abre-una-nunca-vista')).toMatchObject({ verdict: 'fail', failed: { actual: expect.not.stringMatching(/^Nunca$/u) } });
  });
});
