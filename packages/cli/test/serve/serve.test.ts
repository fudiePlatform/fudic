/**
 * BUG-50 §4.5, §6.9 — `fudic dev` and `fudic preview`: which apps, under which base, and what
 * is said once every one answers. The machine is a fake here; `proxy.test.ts` and
 * `node-deps.test.ts` exercise the real one.
 */

import type { Server } from 'node:http';
import { describe, expect, it } from 'vitest';
import { run } from '../../src/run.js';
import { appsToServe } from '../../src/serve/apps.js';
import { serveBanner, serveWorkspace, type AppProcess, type ServeDeps, type ServeKind } from '../../src/serve/workspace.js';
import { appFor, DEV_PORT, normalizeBase, servedApps, type ServedApp } from '../../src/workspace/bases.js';
import { captureStreams, MemoryFs, RecordingRunner } from '../helpers.js';
import type { Project } from '../../src/workspace/discover.js';

const ROOT = '/w';
const WORKSPACE = { 'pnpm-workspace.yaml': "packages:\n  - 'apps/*'\n  - 'libs/*'\n", 'package.json': '{"name":"shop","private":true}' };
const app = (name: string, vite?: string): Record<string, string> => ({
  [`apps/${name}/fudic.json`]: JSON.stringify({ id: name, kind: 'app', prefix: name }),
  ...(vite === undefined ? {} : { [`apps/${name}/vite.config.ts`]: vite }),
});
const LIB = { 'libs/ui/fudic.json': '{"kind":"lib","prefix":"ui"}' };
const ADMIN_VITE = "export default defineConfig({\n  base: '/admin/',\n  server: { port: 5174 },\n  plugins: [fudic()],\n});\n";

function shop(extra: Readonly<Record<string, string>> = {}): MemoryFs {
  return new MemoryFs({ ...WORKSPACE, ...app('web', 'export default {}'), ...app('admin', ADMIN_VITE), ...LIB, ...extra }, ROOT);
}

describe('where each app is served', () => {
  it('normalizes a base however it is written', () => {
    expect(normalizeBase('admin')).toBe('/admin/');
    expect(normalizeBase('/admin')).toBe('/admin/');
    expect(normalizeBase('admin/')).toBe('/admin/');
    expect(normalizeBase('//a/b//')).toBe('/a/b/');
    expect(normalizeBase('')).toBe('/');
    expect(normalizeBase('/')).toBe('/');
  });

  it('reads base and port from each app\'s vite.config.ts, with Vite\'s defaults, apps only, longest base first', () => {
    const fs = shop(app('blog', 'export default { base: "/blog/" }'));
    const project = (name: string, kind: 'app' | 'lib'): Project =>
      ({ name, path: `${ROOT}/${kind === 'app' ? 'apps' : 'libs'}/${name}`, config: { kind } }) as unknown as Project;
    const apps = servedApps([project('web', 'app'), project('ui', 'lib'), project('blog', 'app'), project('admin', 'app'), project('none', 'app')], fs);
    expect(apps.map(({ name, base, port }) => ({ name, base, port }))).toEqual([
      { name: 'admin', base: '/admin/', port: 5174 },
      { name: 'blog', base: '/blog/', port: DEV_PORT },
      { name: 'none', base: '/', port: DEV_PORT },
      { name: 'web', base: '/', port: DEV_PORT },
    ]);
  });

  it('sends a path to the app with the longest base it starts with', () => {
    const apps = [{ base: '/' }, { base: '/admin/' }, { base: '/admin/reports/' }];
    expect(appFor(apps, '/admin/reports/x')).toEqual({ base: '/admin/reports/' });
    expect(appFor(apps, '/admin/x')).toEqual({ base: '/admin/' });
    expect(appFor(apps, '/admin')).toEqual({ base: '/admin/' });
    expect(appFor(apps, '/administrator')).toEqual({ base: '/' });
    expect(appFor([{ base: '/admin/' }], '/other')).toBeUndefined();
  });
});

describe('which apps fudic dev serves', () => {
  it('from the workspace, or anywhere inside it: every app', () => {
    for (const cwd of [ROOT, `${ROOT}/apps/web/src`]) {
      const { apps, errors } = appsToServe('dev', { cwd, force: false }, shop());
      expect(errors).toEqual([]);
      expect(apps.map((a) => `${a.name} ${a.base}`)).toEqual(['admin /admin/', 'web /']);
    }
  });

  it('with --project, that one alone', () => {
    const { apps } = appsToServe('dev', { cwd: ROOT, force: false, project: 'admin' }, shop());
    expect(apps.map((a) => a.name)).toEqual(['admin']);
  });

  it('outside a workspace, the app it runs in', () => {
    const fs = new MemoryFs(app('solo'), ROOT);
    const { apps } = appsToServe('dev', { cwd: `${ROOT}/apps/solo`, force: false }, fs);
    expect(apps.map((a) => `${a.name} ${a.base} ${a.port}`)).toEqual(['solo / 5173']);
  });

  it('FUD0453 when there is no app: a workspace of libraries, or --project naming one', () => {
    const libs = new MemoryFs({ ...WORKSPACE, ...LIB }, ROOT);
    expect(appsToServe('dev', { cwd: ROOT, force: false }, libs).errors.map((e) => e.code)).toEqual(['FUD0453']);
    expect(appsToServe('dev', { cwd: ROOT, force: false, project: 'ui' }, shop()).errors.map((e) => e.code)).toEqual(['FUD0453']);
  });

  it('the project errors outside every project, and for a --project nobody has', () => {
    expect(appsToServe('dev', { cwd: '/elsewhere', force: false }, new MemoryFs({}, ROOT)).errors.map((e) => e.code)).toEqual(['FUD0781']);
    expect(appsToServe('dev', { cwd: ROOT, force: false, project: 'nope' }, shop()).errors.map((e) => e.code)).toEqual(['FUD0782']);
  });

  it('preview: FUD0454 for each app with nothing built', () => {
    const { errors } = appsToServe('preview', { cwd: ROOT, force: false }, shop({ 'apps/web/dist/index.html': '<!doctype html>' }));
    expect(errors.map((e) => e.code)).toEqual(['FUD0454']);
    expect(errors[0]?.message).toContain('"admin"');
    expect(appsToServe('dev', { cwd: ROOT, force: false }, shop()).errors).toEqual([]);
  });
});

const served = (name: string, base: string): ServedApp => ({ name, path: `${ROOT}/apps/${name}`, base, port: 0 });

describe('the banner (§6.9)', () => {
  it('lists every app on the one port, shortest base first — exactly', () => {
    expect(serveBanner('dev', [served('admin', '/admin/'), served('web', '/')], 5173)).toBe(`fudic dev — 2 apps on one port

  web     http://localhost:5173/
  admin   http://localhost:5173/admin/
`);
  });

  it('says one app, widens for a long name, and orders a tie by name', () => {
    expect(serveBanner('preview', [served('web', '/')], 4173)).toBe('fudic preview — 1 app on one port\n\n  web     http://localhost:4173/\n');
    expect(serveBanner('dev', [served('storefront', '/b/'), served('back', '/a/')], 1)).toContain(
      '  back         http://localhost:1/a/\n  storefront   http://localhost:1/b/\n',
    );
  });
});

/** A machine that records what was asked of it. */
function fakeDeps(options: { readonly failReady?: boolean } = {}) {
  const log: string[] = [];
  let next = 41000;
  let stop: () => void = () => undefined;
  const stoppedOnce = new Promise<void>((resolve) => {
    stop = resolve;
  });
  const deps: ServeDeps = {
    freePort: () => Promise.resolve(next++),
    start: (a: ServedApp, kind: ServeKind, port: number): AppProcess => {
      log.push(`start ${kind} ${a.name} ${port}`);
      return { stop: () => log.push(`stop ${a.name}`) };
    },
    ready: (port, base) => {
      log.push(`ready ${port} ${base}`);
      return options.failReady === true ? Promise.reject(new Error('nothing answered')) : Promise.resolve();
    },
    listen: (server: Server, port: number) => {
      log.push(`listen ${port}`);
      return Promise.resolve({ close: () => log.push('close') } as unknown as Server);
    },
    stopped: () => stoppedOnce,
    out: (text) => log.push(`out ${text}`),
  };
  return { deps, log, stop: () => stop() };
}

describe('serveWorkspace', () => {
  it('starts every app on a port of its own, waits for all, listens, says so, and stops them with it', async () => {
    const machine = fakeDeps();
    const serving = serveWorkspace('dev', [served('admin', '/admin/'), served('web', '/')], 5173, machine.deps);
    await new Promise((resolve) => setTimeout(resolve, 10));
    machine.stop();
    expect(await serving).toBe(0);
    expect(machine.log).toEqual([
      'start dev admin 41000',
      'start dev web 41001',
      'ready 41000 /admin/',
      'ready 41001 /',
      'listen 5173',
      `out ${serveBanner('dev', [served('admin', '/admin/'), served('web', '/')], 5173)}`,
      'close',
      'stop admin',
      'stop web',
    ]);
  });

  it('stops what it started when an app never answers', async () => {
    const machine = fakeDeps({ failReady: true });
    await expect(serveWorkspace('preview', [served('web', '/')], 4173, machine.deps)).rejects.toThrow('nothing answered');
    expect(machine.log).toEqual(['start preview web 41000', 'ready 41000 /', 'stop web']);
  });
});

describe('fudic dev through the binary', () => {
  it('serves with the machine it is given', async () => {
    const machine = fakeDeps();
    const capture = captureStreams();
    const fs = shop();
    const serving = run(['dev', '--cwd', ROOT, '--port', '3000'], { readIo: fs, writeIo: fs, runner: new RecordingRunner(), streams: capture.streams, serve: machine.deps });
    await new Promise((resolve) => setTimeout(resolve, 10));
    machine.stop();
    expect(await serving).toBe(0);
    expect(machine.log).toContain('listen 3000');
  });

  it('says why it cannot serve, starts nothing and exits 1', async () => {
    const machine = fakeDeps();
    const capture = captureStreams();
    const fs = shop();
    expect(await run(['preview', '--cwd', ROOT], { readIo: fs, writeIo: fs, runner: new RecordingRunner(), streams: capture.streams, serve: machine.deps })).toBe(1);
    expect(capture.stderr()).toContain('app "web" has no build');
    expect(capture.stderr()).toContain('app "admin" has no build');
    expect(machine.log).toEqual([]);
  });
});
