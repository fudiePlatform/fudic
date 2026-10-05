import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { classify, onFullReload, Rerunner } from '../src/rerun.js';
import type { BenchTarget } from '../src/target.js';

const TARGET: BenchTarget = {
  tag: 'app-tabs',
  component: 'C:/proj/src/components/app-tabs.fud',
  spec: null,
  fixture: null,
  projectRoot: 'C:/proj',
};

describe('classify', () => {
  it('asks for a new session on the .fudspec and the fixture, even without one yet', () => {
    expect(classify('C:/proj/src/components/app-tabs.fudspec', TARGET)).toBe('session');
    expect(classify('C:\\proj\\src\\components\\app-tabs.fixture.ts', TARGET)).toBe('session');
  });

  it('asks for a new session on a term of the project', () => {
    expect(classify('C:/proj/fudic/terms/then/text.js', TARGET)).toBe('session');
    expect(classify('C:/proj/fudic/terms/then/README.md', TARGET)).toBe('none');
    expect(classify('C:/other/fudic/terms/then/text.js', TARGET)).toBe('none');
  });

  it('waits for Vite on any .fud, and ignores the rest', () => {
    expect(classify('C:/proj/src/components/app-tabs.fud', TARGET)).toBe('component');
    expect(classify('C:/proj/src/components/app-badge.fud', TARGET)).toBe('component');
    expect(classify('C:/proj/src/components/app-badge.fudspec', TARGET)).toBe('none');
    expect(classify('C:/proj/src/styles/theme.css', TARGET)).toBe('none');
  });
});

/** A run that ends when the test says so, recording every reload and run. */
function deps() {
  const log: string[] = [];
  let finish: (() => void) | undefined;
  const d = {
    log,
    reload: vi.fn(async () => {
      log.push('reload');
    }),
    run: vi.fn(
      () =>
        new Promise<void>((done) => {
          log.push('run');
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

  it('a session change reloads and runs at once', async () => {
    const d = deps();
    new Rerunner(d).changed('session');
    await vi.advanceTimersByTimeAsync(0);
    expect(d.log).toEqual(['reload', 'run']);
  });

  it('a .fud change waits for the full-reload, and runs without reloading', async () => {
    const d = deps();
    const rerunner = new Rerunner(d);
    rerunner.changed('component');
    await vi.advanceTimersByTimeAsync(5_000);
    expect(d.log).toEqual([]);
    rerunner.fullReload();
    await vi.advanceTimersByTimeAsync(0);
    expect(d.log).toEqual(['run']);
  });

  it('a .fud change runs after 10 s when no full-reload comes', async () => {
    const d = deps();
    new Rerunner(d).changed('component');
    await vi.advanceTimersByTimeAsync(9_999);
    expect(d.log).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(d.log).toEqual(['run']);
  });

  it('takes its own timeout', async () => {
    const d = deps();
    new Rerunner({ ...d, reloadTimeout: 50 }).changed('component');
    await vi.advanceTimersByTimeAsync(50);
    expect(d.log).toEqual(['run']);
  });

  it('a full-reload with no .fud change waiting runs nothing, and two .fud changes wait once', async () => {
    const d = deps();
    const rerunner = new Rerunner(d);
    rerunner.fullReload();
    rerunner.changed('component');
    rerunner.changed('component');
    rerunner.changed('none');
    rerunner.fullReload();
    rerunner.fullReload();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(d.log).toEqual(['run']);
  });

  it('criterion 20 — five saves during a run are exactly one run more', async () => {
    const d = deps();
    const rerunner = new Rerunner(d);
    rerunner.request(false);
    await vi.advanceTimersByTimeAsync(0);
    for (let i = 0; i < 5; i += 1) rerunner.changed('session');
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
    rerunner.changed('component');
    rerunner.fullReload();
    await d.end();
    expect(d.log).toEqual(['run', 'run']);
  });

  it('stop forgets the waiting .fud change and the pending run', async () => {
    const d = deps();
    const rerunner = new Rerunner(d);
    rerunner.request(false);
    await vi.advanceTimersByTimeAsync(0);
    rerunner.request(true);
    rerunner.changed('component');
    rerunner.stop();
    await d.end();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(d.log).toEqual(['run']);
  });
});

describe('onFullReload', () => {
  it('calls back on every full-reload and still sends everything', () => {
    const sent: unknown[] = [];
    const hot = {
      tag: 'hot',
      send(this: { tag: string }, ...args: unknown[]) {
        sent.push([this.tag, ...args]);
      },
    };
    let reloads = 0;
    onFullReload(hot as never, () => (reloads += 1));
    hot.send({ type: 'full-reload', path: '*' });
    hot.send({ type: 'update', updates: [] });
    hot.send('custom-event', { x: 1 });
    expect(reloads).toBe(1);
    expect(sent).toEqual([
      ['hot', { type: 'full-reload', path: '*' }],
      ['hot', { type: 'update', updates: [] }],
      ['hot', 'custom-event', { x: 1 }],
    ]);
  });
});
