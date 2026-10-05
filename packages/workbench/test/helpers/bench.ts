/**
 * A test workbench: Vite with the real fudic plugin behind an http.Server on 127.0.0.1, the
 * pages of a plan written under the project's bench folder, and the system Chrome. It is the
 * architecture of the spec, put together by hand so the engine can be checked before the
 * session that will own it exists.
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer as createHttp, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fudic } from '@fudic/vite';
import { parseSpec, type BlockKind, type TermParam } from '@fudic/spec';
import { createServer as createVite, type ViteDevServer } from 'vite';
import { launchBrowser, type BrowserLike } from '../../src/browser.js';
import type { LoadedTerm } from '../../src/engine.js';
import { benchDir, planBench, type BenchPlan, type ExecutedFixtures } from '../../src/pages.js';
import { slashes, type BenchTarget } from '../../src/target.js';
import { isFailure } from '../../src/types.js';

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

/** One workbench folder per project and tag, as the session lays it out. */
export async function startBench(root: string, tag: string): Promise<TestBench> {
  const dir = benchDir({ tag, component: '', spec: null, fixture: null, projectRoot: root });
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(`${dir}/routes`, { recursive: true });

  const http: Server = createHttp();
  const vite = await createVite({
    root,
    configFile: false,
    appType: 'custom',
    logLevel: (process.env.BENCH_LOG as 'info' | undefined) ?? 'silent',
    plugins: [fudic({ routesDir: slashes(relative(root, `${dir}/routes`)) })],
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
      const plan = planBench({ target, spec: parseSpec(spec).value, fixtures });
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

/** The terms of a `fudic/terms` folder, imported as they are and wrapped. */
export function termsFrom(dir: string): (block: BlockKind, name: string) => Promise<LoadedTerm> {
  return async (block, name) => {
    const mod = (await import(pathToFileURL(`${dir}/${block}/${name}.js`).href)) as TermFile;
    return { layer: 'workspace', params: mod.meta.params, run: mod.run };
  };
}
