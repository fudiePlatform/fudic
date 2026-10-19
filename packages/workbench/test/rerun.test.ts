import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import type { ViteDevServer } from 'vite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyBenchDir, writePlanFiles } from '../src/bench-dir.js';
import { benchDir, benchRoutesDir, mountFiles } from '../src/pages.js';
import { classify, Rerunner } from '../src/rerun.js';
import type { BenchTarget } from '../src/target.js';
import { processedChanges, startVite } from '../src/vite.js';
import { tempProject, type TempProject } from './helpers/project.js';

const TARGET: BenchTarget = {
  tag: 'app-tabs',
  component: 'C:/proj/src/components/app-tabs.fud',
  spec: null,
  fixture: null,
  projectRoot: 'C:/proj',
};

/** What app-tabs reads: itself, and a component it links. */
const READS: ReadonlySet<string> = new Set(['C:/proj/src/components/app-tabs.fud', 'C:/proj/src/components/app-badge.fud']);

describe('classify', () => {
  it('asks for a new session on the .fudspec and the fixture, even without one yet', () => {
    expect(classify('C:/proj/src/components/app-tabs.fudspec', TARGET, READS)).toBe('session');
    expect(classify('C:\\proj\\src\\components\\app-tabs.fixture.ts', TARGET, READS)).toBe('session');
  });

  it('asks for a new session on a term of the project', () => {
    expect(classify('C:/proj/fudic/terms/then/text.js', TARGET, READS)).toBe('session');
    expect(classify('C:/proj/fudic/terms/then/README.md', TARGET, READS)).toBe('none');
    expect(classify('C:/other/fudic/terms/then/text.js', TARGET, READS)).toBe('none');
  });

  it('criterion 5 — runs on a .fud it reads, and not on one it does not', () => {
    expect(classify('C:/proj/src/components/app-tabs.fud', TARGET, READS)).toBe('component');
    expect(classify('C:\\proj\\src\\components\\app-badge.fud', TARGET, READS)).toBe('component');
    expect(classify('C:/proj/src/components/app-card.fud', TARGET, READS)).toBe('none');
    expect(classify('C:/proj/src/components/app-badge.fudspec', TARGET, READS)).toBe('none');
    expect(classify('C:/proj/src/styles/theme.css', TARGET, READS)).toBe('none');
  });
});

/** A run that ends when the test says so, recording every reload and run, with what it ran. */
function deps() {
  const log: string[] = [];
  const runs: { trigger: string | null; ids: readonly string[] | undefined }[] = [];
  let finish: (() => void) | undefined;
  const d = {
    log,
    runs,
    reload: vi.fn(async () => {
      log.push('reload');
    }),
    run: vi.fn(
      (trigger: string | null, ids: readonly string[] | undefined) =>
        new Promise<void>((done) => {
          log.push('run');
          runs.push({ trigger, ids });
          finish = done;
        }),
    ),
    /** Ends the current run and lets the next one start. */
    async end() {
      const f = finish;
      finish = undefined;
      f?.();
      await vi.advanceTimersByTimeAsync(0);
    },
  };
  return d;
}

describe('Rerunner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('a session change reloads and runs at once, every criterion, saying what was saved', async () => {
    const d = deps();
    new Rerunner(d).changed('session', 'C:/p/a.fudspec');
    await vi.advanceTimersByTimeAsync(0);
    expect(d.log).toEqual(['reload', 'run']);
    expect(d.runs).toEqual([{ trigger: 'C:/p/a.fudspec', ids: undefined }]);
  });

  it('criterion 1 — a .fud change runs at once, without reloading and without a timer', async () => {
    const d = deps();
    new Rerunner(d).changed('component', 'C:/p/a.fud');
    await vi.advanceTimersByTimeAsync(0);
    expect(d.log).toEqual(['run']);
  });

  it('a change to nothing it reads runs nothing', async () => {
    const d = deps();
    new Rerunner(d).changed('none', 'C:/p/b.fud');
    await vi.advanceTimersByTimeAsync(20_000);
    expect(d.log).toEqual([]);
  });

  it('a request with no trigger runs as asked by hand, with its ids', async () => {
    const d = deps();
    new Rerunner(d).request(false, null, ['a']);
    await vi.advanceTimersByTimeAsync(0);
    expect(d.runs).toEqual([{ trigger: null, ids: ['a'] }]);
  });

  it('two .fud changes during a run are one run more, with the last trigger', async () => {
    const d = deps();
    const rerunner = new Rerunner(d);
    rerunner.changed('component', 'C:/p/a.fud');
    await vi.advanceTimersByTimeAsync(0);
    rerunner.changed('component', 'C:/p/b.fud');
    rerunner.changed('component', 'C:/p/c.fud');
    await d.end();
    await d.end();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(d.log).toEqual(['run', 'run']);
    expect(d.runs[1]!.trigger).toBe('C:/p/c.fud');
  });

  it('a pending trigger survives a request by hand after it', async () => {
    const d = deps();
    const rerunner = new Rerunner(d);
    rerunner.request(false);
    await vi.advanceTimersByTimeAsync(0);
    rerunner.changed('component', 'C:/p/a.fud');
    rerunner.request(false, null, ['x']);
    await d.end();
    expect(d.runs[1]).toEqual({ trigger: 'C:/p/a.fud', ids: undefined });
  });

  it('pending selections merge: two lists are their union, and every criterion wins', async () => {
    const d = deps();
    const rerunner = new Rerunner(d);
    rerunner.request(false);
    await vi.advanceTimersByTimeAsync(0);
    rerunner.request(false, null, ['a', 'b']);
    rerunner.request(false, null, ['b', 'c']);
    await d.end();
    expect(d.runs[1]!.ids).toEqual(['b', 'c', 'a']);
    rerunner.request(false, null, ['a']);
    rerunner.request(false);
    rerunner.request(false, null, ['c']);
    await d.end();
    expect(d.runs[2]!.ids).toBeUndefined();
  });

  it('criterion 20 — five saves during a run are exactly one run more', async () => {
    const d = deps();
    const rerunner = new Rerunner(d);
    rerunner.request(false);
    await vi.advanceTimersByTimeAsync(0);
    for (let i = 0; i < 5; i += 1) rerunner.changed('session', 'C:/p/a.fudspec');
    await d.end();
    expect(d.log).toEqual(['run', 'reload', 'run']);
    await d.end();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(d.log).toEqual(['run', 'reload', 'run']);
    expect(d.run).toHaveBeenCalledTimes(2);
  });

  it('the pending run reloads if any of the changes asked for it', async () => {
    const d = deps();
    const rerunner = new Rerunner(d);
    rerunner.request(false);
    await vi.advanceTimersByTimeAsync(0);
    rerunner.request(true);
    rerunner.request(false);
    await d.end();
    expect(d.log).toEqual(['run', 'reload', 'run']);
  });

  it('a pending run without a session change does not reload', async () => {
    const d = deps();
    const rerunner = new Rerunner(d);
    rerunner.request(false);
    await vi.advanceTimersByTimeAsync(0);
    rerunner.changed('component', 'C:/p/a.fud');
    await d.end();
    expect(d.log).toEqual(['run', 'run']);
  });

  it('stop forgets the pending run and refuses new ones', async () => {
    const d = deps();
    const rerunner = new Rerunner(d);
    rerunner.request(false);
    await vi.advanceTimersByTimeAsync(0);
    rerunner.request(true);
    rerunner.stop();
    await d.end();
    rerunner.changed('component', 'C:/p/a.fud');
    rerunner.changed('session', 'C:/p/a.fudspec');
    await vi.advanceTimersByTimeAsync(20_000);
    expect(d.log).toEqual(['run']);
  });
});

describe('processedChanges — criterion 1, against a real Vite', () => {
  /** A component with no client JS: it is in no client graph, and Vite reloads nothing for it. */
  const STATIC = '<app-still>\n  <template shadowrootmode="open">\n    <p>still</p>\n  </template>\n</app-still>\n';

  /** Leaves out the probe `watching` writes. */
  const fud = (file: string) => file.endsWith('.fud');

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

  async function start(p: TempProject, onProcessed: (file: string) => void): Promise<ViteDevServer> {
    p.write('src/components/app-still.fud', STATIC);
    const target = { tag: 'app-still', component: p.path('src/components/app-still.fud'), spec: null, fixture: null, projectRoot: p.root };
    const dir = benchDir(p.root);
    emptyBenchDir(dir);
    writePlanFiles(dir, target.tag, mountFiles(target));
    http = createServer();
    vite = await startVite({ root: p.root, routesDir: benchRoutesDir(), http, onProcessed });
    // A component reaches Vite's graphs when a page asks for it, as the engine's Chrome would.
    await vite.environments['ssr']!.transformRequest(target.component);
    return vite;
  }

  /**
   * Resolves once Vite's watcher reports a write: on Windows it starts hearing the disk a while
   * after `createServer` resolves, and a save before that is lost for every listener alike.
   */
  async function watching(v: ViteDevServer, p: TempProject): Promise<void> {
    let heard = false;
    const hear = (_event: string, file: string) => {
      if (file.endsWith('probe.txt')) heard = true;
    };
    v.watcher.on('all', hear);
    for (let i = 0; !heard; i += 1) {
      p.write('src/probe.txt', String(i));
      await new Promise((done) => setTimeout(done, 100));
    }
    v.watcher.off('all', hear);
  }

  it('saving a .fud without client JS is processed from hotUpdate, with no full-reload', async () => {
    project = tempProject('processed');
    const processed: string[] = [];
    const v = await start(project, (file) => processed.push(file));
    const reloads: unknown[] = [];
    const send = v.environments['client']!.hot.send.bind(v.environments['client']!.hot);
    v.environments['client']!.hot.send = ((payload: { type?: string }) => {
      if (typeof payload === 'object' && payload.type === 'full-reload') reloads.push(payload);
      send(payload as never);
    }) as typeof send;

    await watching(v, project);
    const saved = Date.now();
    project.write('src/components/app-still.fud', STATIC.replace('still</p>', 'moved</p>'));
    await expect.poll(() => processed.filter(fud), { timeout: 5_000 }).toEqual([project.path('src/components/app-still.fud')]);
    expect(Date.now() - saved).toBeLessThan(2_000);
    expect(reloads).toEqual([]);
  }, 60_000);

  it('a full-reload with no file changed processes nothing', async () => {
    project = tempProject('processed-reload');
    const processed: string[] = [];
    const v = await start(project, (file) => processed.push(file));
    await watching(v, project);
    v.environments['client']!.hot.send({ type: 'full-reload', path: '*' });
    await new Promise((done) => setTimeout(done, 500));
    expect(processed.filter(fud)).toEqual([]);
  }, 60_000);

  it('waits for every environment, and a file goes once per change', () => {
    const processed: string[] = [];
    const plugin = processedChanges((file) => processed.push(file));
    (plugin.configureServer as (server: unknown) => void)({ environments: { client: {}, ssr: {} } });
    const hot = (environment: string, file: string) =>
      (plugin.hotUpdate as (this: unknown, options: { file: string }) => void).call({ environment: { name: environment } }, { file });
    hot('client', 'C:\\proj\\a.fud');
    expect(processed).toEqual([]);
    hot('client', 'C:\\proj\\a.fud');
    hot('ssr', 'C:\\proj\\a.fud');
    expect(processed).toEqual(['C:/proj/a.fud']);
    hot('ssr', 'C:\\proj\\a.fud');
    expect(processed).toEqual(['C:/proj/a.fud']);
    hot('client', 'C:\\proj\\a.fud');
    expect(processed).toEqual(['C:/proj/a.fud', 'C:/proj/a.fud']);
  });
});

describe('startVite — criterion 2', () => {
  it('creates the plugin with liveCheck: false and serverReload: false', async () => {
    vi.resetModules();
    const options: unknown[] = [];
    vi.doMock('@fudic/vite', () => ({
      fudic: (o: unknown) => {
        options.push(o);
        return { name: 'fudic-stub' };
      },
    }));
    try {
      const { startVite: start } = await import('../src/vite.js');
      const http = createServer();
      const v = await start({ root: tmpdir(), routesDir: 'routes', http, onProcessed: () => undefined });
      await v.close();
      expect(options).toEqual([{ routesDir: 'routes', liveCheck: false, serverReload: false }]);
    } finally {
      vi.doUnmock('@fudic/vite');
      vi.resetModules();
    }
  }, 60_000);
});
