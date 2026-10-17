/**
 * A test workbench: Vite with the real fudic plugin behind an http.Server on 127.0.0.1, the
 * pages of a plan written under the project's bench folder, and the system Chrome. It is the
 * architecture of the spec, put together by hand so the engine can be checked before the
 * session that will own it exists.
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer as createHttp, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fudic } from '@fudic/vite';
import { parseSpec, type BlockKind, type TermParam } from '@fudic/spec';
import { createServer as createVite, type ViteDevServer } from 'vite';
import { launchBrowser, type BrowserLike } from '../../src/browser.js';
import type { LoadedTerm } from '../../src/engine.js';
import type { LoadedExtension } from '../../src/extension.js';
import { benchDir, planBench, type BenchPlan, type ExecutedFixtures } from '../../src/pages.js';
import { resolveRuntime } from '../../src/runtime.js';
import { slashes, type BenchTarget } from '../../src/target.js';
import { isFailure } from '../../src/types.js';
import { vi } from 'vitest';

// Every browser test imports this module. Starting or closing a Vite and a Chrome takes seconds,
// and tens of seconds while the other files do the same in parallel: the defaults are too short.
vi.setConfig({ hookTimeout: 120_000 });

export const REPO = slashes(fileURLToPath(new URL('../../../../', import.meta.url))).replace(/\/$/u, '');
export const EXAMPLE = `${REPO}/examples/basic`;
export const PROJECT = slashes(fileURLToPath(new URL('../fixtures/project', import.meta.url)));
export const EXAMPLE_TERMS = `${EXAMPLE}/fudic/terms`;

export interface TestBench {
  readonly origin: string;
  readonly vite: ViteDevServer;
  readonly dir: string;
  /** Every request URL the server saw, in order. */
  readonly requests: string[];
  /** Requests whose URL matches are held this long before Vite answers them. */
  slow: { readonly match: RegExp; readonly ms: number } | null;
  /** Plans a component's criteria and writes their pages; the plan comes back. */
  plan(target: BenchTarget, spec: string, fixtures?: ExecutedFixtures): BenchPlan;
  /** Executes a fixture module through Vite, as the session will. */
  fixture(file: string): Promise<ExecutedFixtures>;
  close(): Promise<void>;
}

/**
 * The workbench folder of this test process, as a real workbench lays it out: keyed by pid, so
 * a real workbench running in parallel on the same project neither shares nor sweeps it.
 */
export async function startBench(root: string): Promise<TestBench> {
  const dir = benchDir(root);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(`${dir}/routes`, { recursive: true });

  const http: Server = createHttp();
  const vite = await createVite({
    root,
    configFile: false,
    appType: 'custom',
    logLevel: (process.env.BENCH_LOG as 'info' | undefined) ?? 'silent',
    plugins: [fudic({ routesDir: slashes(relative(root, `${dir}/routes`)), liveCheck: false })],
    server: { middlewareMode: true, hmr: { server: http, overlay: false } },
  });
  const requests: string[] = [];
  http.on('request', (req, res) => {
    const url = req.url ?? '';
    requests.push(url);
    const slow = bench.slow;
    const wait = slow !== null && slow.match.test(url) ? slow.ms : 0;
    setTimeout(() => {
      vite.middlewares(req, res, () => {
        res.writeHead(404).end('not found');
      });
    }, wait);
  });
  await new Promise<void>((done) => http.listen(0, '127.0.0.1', done));
  const origin = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;

  const bench: TestBench = {
    origin,
    vite,
    dir,
    requests,
    slow: null,
    plan(target, spec, fixtures = {}) {
      const plan = planBench({ target, spec: parseSpec(spec).value, fixtures, dir });
      for (const [file, content] of plan.files) {
        const path = `${dir}/${file}`;
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, content);
      }
      return plan;
    },
    async fixture(file) {
      return ((await vite.ssrLoadModule(file)) as { default: ExecutedFixtures }).default;
    },
    async close() {
      await vite.close();
      await new Promise<void>((done) => http.close(() => done()));
      rmSync(dir, { recursive: true, force: true });
    },
  };
  return bench;
}

export async function chrome(): Promise<BrowserLike> {
  const browser = await launchBrowser();
  if (isFailure(browser)) throw new Error(browser.diagnostic.message);
  return browser;
}

export function target(root: string, tag: string, withFixture = true): BenchTarget {
  const component = `${root}/src/components/${tag}.fud`;
  return {
    tag,
    component,
    spec: `${root}/src/components/${tag}.fudspec`,
    fixture: withFixture ? `${root}/src/components/${tag}.fixture.ts` : null,
    projectRoot: root,
  };
}

interface TermFile {
  readonly meta: { readonly params: readonly TermParam[]; readonly describe?: LoadedTerm['describe'] };
  readonly run: LoadedTerm['run'];
}

/**
 * The terms `examples/basic` runs with, imported as they are and wrapped: its own `fudic/terms`
 * first, then the stock ones of the `@fudic/terms` it installed — the two layers, in their order.
 */
export function exampleTerms(): (block: BlockKind, name: string) => Promise<LoadedTerm> {
  return async (block, name) => {
    const own = `${EXAMPLE_TERMS}/${block}/${name}.js`;
    const runtime = existsSync(own) ? null : await resolveRuntime(EXAMPLE);
    const path = runtime === null ? own : `${runtime.termsDir}/${block}/${name}.js`;
    const mod = (await import(pathToFileURL(path).href)) as TermFile;
    return { path, layer: runtime === null ? 'workspace' : 'framework', params: mod.meta.params, run: mod.run };
  };
}

/** Where `@fudic/terms` lives in the repo: what a project's `node_modules` links to. */
export const TERMS_PACKAGE = `${REPO}/packages/terms`;

/**
 * The extensions a session gives a project with `@fudic/terms`: its stock one, as `examples/basic`
 * resolves it. The workbench never imports the package; the tests do not either.
 */
export async function exampleExtensions(): Promise<readonly LoadedExtension[]> {
  const runtime = await resolveRuntime(EXAMPLE);
  if (runtime === null) throw new Error(`${EXAMPLE} does not resolve @fudic/terms`);
  return [runtime.stock];
}
