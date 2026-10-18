/**
 * `loadSession` on its own, against a real Vite: the corners the end-to-end runs do not reach —
 * the framework layer of terms, a project without `fudic/terms`, a term that cannot be loaded,
 * a fixture without a default export.
 */

import { createServer, type Server } from 'node:http';
import { rmSync } from 'node:fs';
import type { ViteDevServer } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';
import { emptyBenchDir } from '../../src/bench-dir.js';
import { chainContext, type TermHost } from '../../src/extension.js';
import { benchDir, benchRoutesDir } from '../../src/pages.js';
import { BENCH_FILE, type TermsRuntime } from '../../src/runtime.js';
import { loadSession, nodeSpecFs, readText } from '../../src/session.js';
import type { BenchTarget } from '../../src/target.js';
import { invalidateFile, startVite } from '../../src/vite.js';
import { TERMS_PACKAGE } from '../helpers/bench.js';

/** The stock terms of @fudic/terms, as the repo has them. */
const STOCK_TERMS = `${TERMS_PACKAGE}/terms`;
import { tempProject, type TempProject } from '../helpers/project.js';

let project: TempProject | undefined;
let vite: ViteDevServer | undefined;
let http: Server | undefined;

afterEach(async () => {
  await vite?.close();
  http?.close();
  project?.remove();
  vite = undefined;
  http = undefined;
  project = undefined;
});

async function session(
  p: TempProject,
  tag: string,
  extra: { runtime?: TermsRuntime | null } = {},
  override: Partial<BenchTarget> = {},
) {
  const component = p.path(`src/components/${tag}.fud`);
  const target: BenchTarget = {
    tag,
    component,
    spec: p.path(`src/components/${tag}.fudspec`),
    fixture: p.path(`src/components/${tag}.fixture.ts`),
    projectRoot: p.root,
    ...override,
  };
  http = createServer();
  vite = await startVite({ root: p.root, routesDir: benchRoutesDir(), http, onProcessed: () => undefined });
  const dir = benchDir(p.root);
  emptyBenchDir(dir);
  return loadSession({ target, vite, dir, ...extra });
}

describe('loadSession', () => {
  it('finds the terms in the framework layer when the project has none', async () => {
    project = tempProject('framework');
    rmSync(project.path('fudic'), { recursive: true });
    project.write('src/components/app-tabs.fudspec', 'component app-tabs\n\ncriterion a\n  then\n    visible role:tab/"Tab A"\n');
    project.write('src/components/app-tabs.fixture.ts', 'export default {};\n');
    const loaded = await session(project, 'app-tabs', { runtime: { termsDir: STOCK_TERMS, stock: { file: 'C:/stock.js', extension: {} } } });
    expect(loaded.message.diagnostics).toEqual([]);
    expect(loaded.message.criteria).toEqual([
      {
        id: 'a',
        route: '/app-tabs/a',
        line: 3,
        props: null,
        steps: [{ block: 'then', text: 'role:tab/"Tab A" is visible', file: `${STOCK_TERMS}/then/visible.js`, line: 5 }],
      },
    ]);
    expect((await loaded.loadTerm('then', 'visible')).layer).toBe('framework');
    await expect(loaded.loadTerm('then', 'nope')).rejects.toThrow('there is no then term "nope"');
  }, 60_000);

  it('says each criterion\'s props line and fixture entry, and null for one mounted bare', async () => {
    project = tempProject('props');
    project.write(
      'src/components/app-tabs.fudspec',
      'component app-tabs\n\ncriterion uno\n  given\n    props uno\n  then\n    visible app-tabs\n\n' +
        'criterion sin\n  then\n    visible app-tabs\n',
    );
    project.write('src/components/app-tabs.fixture.ts', 'export default { uno: {} };\n');
    const loaded = await session(project, 'app-tabs');
    expect(loaded.message.diagnostics).toEqual([]);
    expect(loaded.message.criteria.map((c) => [c.id, c.line, c.props, c.steps.map((s) => s.line)])).toEqual([
      ['uno', 3, { name: 'uno', line: 5 }, [7]],
      ['sin', 9, null, [11]],
    ]);
  }, 60_000);

  it('describes a step by its written line when its term has no describe, or cannot be loaded', async () => {
    project = tempProject('describe');
    project.write(
      'fudic/terms/then/plain.js',
      "export const meta = { name: 'plain', block: 'then', params: [{ name: 'target', type: 'element' }] };\n" +
        "export async function run() { return { pass: true, evidence: 'plain' }; }\n" +
        'export const selfTest = [];\n',
    );
    // Valid as the catalog reads it; executing the module throws.
    project.write(
      'fudic/terms/then/broken.js',
      "export const meta = { name: 'broken', block: 'then', params: [{ name: 'target', type: 'element' }], describe: () => 'never' };\n" +
        "export async function run() { return { pass: true, evidence: 'never' }; }\n" +
        'export const selfTest = [];\n' +
        "throw new Error('cannot load');\n",
    );
    project.write(
      'src/components/app-tabs.fudspec',
      'component app-tabs\n\ncriterion a\n  then\n    plain role:tab/"Tab A"\n    broken app-tabs\n',
    );
    // A fixture with no default export executes to no entries.
    project.write('src/components/app-tabs.fixture.ts', 'export const nothing = 1;\n');
    const loaded = await session(project, 'app-tabs');
    expect(loaded.message.diagnostics).toEqual([]);
    expect(loaded.message.criteria[0]!.steps).toEqual([
      { block: 'then', text: 'plain role:tab/"Tab A"', file: project.path('fudic/terms/then/plain.js'), line: 5 },
      { block: 'then', text: 'broken app-tabs', file: null, line: 6 },
    ]);
    expect(loaded.criteria[0]).toMatchObject({ id: 'a', fixture: null });
  }, 60_000);
});

describe('loadSession, with a .fudspec it cannot run', () => {
  it('reads a .fudspec that is gone as an empty file, and runs nothing', async () => {
    project = tempProject('spec-gone');
    const loaded = await session(project, 'app-tabs');
    expect(loaded.criteria).toEqual([]);
    expect(loaded.message.diagnostics.length).toBeGreaterThan(0);
  }, 60_000);

  it('knows no component but its own tag', async () => {
    project = tempProject('other-tag');
    project.write('src/components/app-tabs.fudspec', 'component app-other\n\ncriterion a\n  then\n    visible role:tab\n');
    const loaded = await session(project, 'app-tabs');
    expect(loaded.criteria).toEqual([]);
    expect(loaded.message.diagnostics.some((d) => d.severity === 'error')).toBe(true);
  }, 60_000);

  it('knows no fixture without its file, nor for another tag', async () => {
    const spec = 'component app-tabs\n\ncriterion a\n  given\n    props uno\n  then\n    visible role:tabpanel\n';
    project = tempProject('no-fixture');
    project.write('src/components/app-tabs.fudspec', spec);
    // The target names a fixture that is not on disk.
    const missing = await session(project, 'app-tabs');
    expect(missing.criteria).toEqual([]);
    expect(missing.message.diagnostics.some((d) => d.severity === 'error')).toBe(true);
  }, 60_000);

  it('knows no fixture when the component has none', async () => {
    project = tempProject('null-fixture');
    project.write(
      'src/components/app-tabs.fudspec',
      'component app-tabs\n\ncriterion a\n  given\n    props uno\n  then\n    visible role:tabpanel\n',
    );
    const loaded = await session(project, 'app-tabs', {}, { fixture: null });
    expect(loaded.criteria).toEqual([]);
    expect(loaded.message.diagnostics.some((d) => d.severity === 'error')).toBe(true);
  }, 60_000);
});

describe('the disk of a session', () => {
  it('reads nothing where there is nothing', () => {
    expect(readText('C:/definitely/not/here.txt')).toBeUndefined();
    expect(nodeSpecFs.readDirectory('C:/definitely/not/here')).toEqual([]);
  });

  it('forgets a file Vite never loaded without complaint', async () => {
    project = tempProject('invalidate');
    http = createServer();
    vite = await startVite({ root: project.root, routesDir: benchRoutesDir(), http, onProcessed: () => undefined });
    expect(() => invalidateFile(vite!, project!.path('src/nothing.ts'))).not.toThrow();
  }, 60_000);
});

/** The ctx the session's extensions build, on a host nobody calls. */
function contextOf(loaded: Awaited<ReturnType<typeof loadSession>>): Record<string, unknown> {
  return chainContext(loaded.extensions, {} as TermHost) as Record<string, unknown>;
}

const SPEC = 'component app-tabs\n\ncriterion a\n  then\n    visible app-tabs\n\ncriterion b\n  then\n    visible app-tabs\n';

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

describe('loadSession — SDD-59 §4.2, who loads the extensions', () => {
  it('resolves @fudic/terms from the project: its stock extension, and its terms/ as the framework layer', async () => {
    project = tempProject('runtime');
    project.write('src/components/app-tabs.fudspec', SPEC);
    const loaded = await session(project, 'app-tabs', {}, { fixture: null });
    expect(loaded.extensions.map((e) => e.file)).toEqual([`${TERMS_PACKAGE}/dist/index.js`]);
    expect(Object.keys(contextOf(loaded)).sort()).toEqual(['act', 'locate', 'page', 'text']);
    expect(loaded.criteria.map((c) => c.error)).toEqual([undefined, undefined]);
  }, 60_000);

  it('without @fudic/terms, the ctx says the package is missing on any use', async () => {
    project = tempProject('no-runtime', { terms: false });
    project.write('src/components/app-tabs.fudspec', SPEC);
    const loaded = await session(project, 'app-tabs', {}, { fixture: null });
    expect(loaded.extensions.map((e) => e.file)).toEqual(['@fudic/terms']);
    const message = `@fudic/terms is not installed in ${project.root}: pnpm add -D @fudic/terms`;
    const ctx = contextOf(loaded);
    expect(() => ctx['locate']).toThrow(message);
    expect(() => ctx['anything']).toThrow(message);
    // Only the project layer, which has no `visible` (SDD-59 §6.7.5).
    expect(loaded.message.diagnostics.map((d) => [d.code, d.line])).toEqual([
      ['FUD0940', 5],
      ['FUD0940', 9],
    ]);
    await expect(loaded.loadTerm('then', 'visible')).rejects.toThrow('there is no then term "visible"');
  }, 60_000);

  it('a runtime given as null is no runtime, whatever the project has installed', async () => {
    project = tempProject('null-runtime');
    project.write('src/components/app-tabs.fudspec', SPEC);
    const loaded = await session(project, 'app-tabs', { runtime: null }, { fixture: null });
    expect(loaded.extensions.map((e) => e.file)).toEqual(['@fudic/terms']);
  }, 60_000);

  it('loads fudic/bench.js of the project after the stock extension, through Vite', async () => {
    project = tempProject('bench-js');
    project.write('src/components/app-tabs.fudspec', SPEC);
    project.write(BENCH_FILE, BENCH_JS);
    const loaded = await session(project, 'app-tabs', {}, { fixture: null });
    expect(loaded.extensions.map((e) => e.file)).toEqual([`${TERMS_PACKAGE}/dist/index.js`, project.path(BENCH_FILE)]);
    expect(typeof loaded.extensions[1]!.extension.setup).toBe('function');
    expect(Object.keys(contextOf(loaded)).sort()).toEqual(['act', 'locate', 'openMenu', 'page', 'text']);
    expect(loaded.criteria.map((c) => c.error)).toEqual([undefined, undefined]);
  }, 60_000);

  it('a fudic/bench.js without a default export extends nothing', async () => {
    project = tempProject('bench-js-empty');
    project.write('src/components/app-tabs.fudspec', SPEC);
    project.write(BENCH_FILE, 'export const unused = 1;\n');
    const loaded = await session(project, 'app-tabs', {}, { fixture: null });
    expect(loaded.extensions[1]).toEqual({ file: project.path(BENCH_FILE), extension: {} });
    expect(Object.keys(contextOf(loaded)).sort()).toEqual(['act', 'locate', 'page', 'text']);
  }, 60_000);

  it('a fudic/bench.js that throws while loading leaves every criterion in error, with the message and its path', async () => {
    project = tempProject('bench-js-throws');
    project.write('src/components/app-tabs.fudspec', SPEC);
    project.write(BENCH_FILE, "throw new Error('no bench today\\nsecond line');\n");
    const loaded = await session(project, 'app-tabs', {}, { fixture: null });
    const error = `${project.path(BENCH_FILE)}: no bench today`;
    expect(loaded.criteria.map((c) => [c.id, c.error])).toEqual([
      ['a', error],
      ['b', error],
    ]);
    expect(loaded.extensions.map((e) => e.file)).toEqual([`${TERMS_PACKAGE}/dist/index.js`]);
  }, 60_000);
});
