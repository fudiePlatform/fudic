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
import { benchDir, benchRoutesDir } from '../../src/pages.js';
import { loadSession, nodeSpecFs, readText } from '../../src/session.js';
import type { BenchTarget } from '../../src/target.js';
import { invalidateFile, startVite } from '../../src/vite.js';
import { EXAMPLE_TERMS } from '../helpers/bench.js';
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
  extra: { frameworkTerms?: string } = {},
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
    const loaded = await session(project, 'app-tabs', { frameworkTerms: EXAMPLE_TERMS });
    expect(loaded.message.diagnostics).toEqual([]);
    expect(loaded.message.criteria).toEqual([
      {
        id: 'a',
        route: '/app-tabs/a',
        line: 3,
        steps: [{ block: 'then', text: 'role:tab/"Tab A" is visible', file: `${EXAMPLE_TERMS}/then/visible.js` }],
      },
    ]);
    expect((await loaded.loadTerm('then', 'visible')).layer).toBe('framework');
    await expect(loaded.loadTerm('then', 'nope')).rejects.toThrow('there is no then term "nope"');
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
      { block: 'then', text: 'plain role:tab/"Tab A"', file: project.path('fudic/terms/then/plain.js') },
      { block: 'then', text: 'broken app-tabs', file: null },
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
