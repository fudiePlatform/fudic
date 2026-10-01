/**
 * The live typecheck of `vite dev` (SDD-35 §4.5, criteria 18 and 19).
 *
 * `startLiveCheck` is driven with a fake `ViteDevServer` — a watcher that is a plain
 * `EventEmitter`, a `ws` that records what it is sent, a logger that keeps what it is told —
 * because what it owes the dev server is exactly those three conversations: which file events
 * start a check, what goes to the terminal and the overlay, and when the page reloads. The
 * checker is a scripted fake where the question is the wiring, and the real
 * `createProjectChecker` over a project on disk where the question is the criterion: a saved
 * component that breaks the page pushes the overlay, and fixing it sends `full-reload`.
 */

import { EventEmitter } from 'node:events';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { ViteDevServer } from 'vite';
import { FUD0870, FUD0871, span } from '@fudic/diagnostics';
import {
  toPosix,
  type CheckProblem,
  type CheckReport,
  type ProjectChecker,
  type ProjectProblem,
} from '@fudic/typecheck';
import { asError, startLiveCheck, type OverlayError } from '../src/dev-typecheck.js';

/** What the fake dev server was told. */
interface Told {
  readonly sent: unknown[];
  readonly errors: string[];
  readonly warnings: string[];
  readonly infos: string[];
}

function fakeServer(): { server: ViteDevServer; watcher: EventEmitter; told: Told } {
  const watcher = new EventEmitter();
  const told: Told = { sent: [], errors: [], warnings: [], infos: [] };
  const server = {
    config: {
      logger: {
        error: (message: string) => told.errors.push(message),
        warn: (message: string) => told.warnings.push(message),
        info: (message: string) => told.infos.push(message),
      },
    },
    watcher,
    ws: { send: (payload: unknown) => told.sent.push(payload) },
  };
  return { server: server as unknown as ViteDevServer, watcher, told };
}

/** A checker that answers each `check()` with the next report of the script, then the last. */
function scripted(...reports: CheckReport[]): {
  check: Mock<ProjectChecker['check']>;
  invalidate: Mock<ProjectChecker['invalidate']>;
} {
  let last = reports[reports.length - 1]!;
  return {
    check: vi.fn(() => {
      last = reports.shift() ?? last;
      return last;
    }),
    invalidate: vi.fn<ProjectChecker['invalidate']>(),
  };
}

const root = toPosix(mkdtempSync(join(tmpdir(), 'fudic-live-')));
mkdirSync(join(root, 'src'), { recursive: true });
const page = `${root}/src/Page.fud`;
const badge = `${root}/src/app-badge.fud`;
const helper = `${root}/src/helper.ts`;
writeFileSync(page, 'const n: number = "x";\n');
writeFileSync(badge, '<app-badge></app-badge>\n');
writeFileSync(helper, 'export const x = 1;\n');

const problem = (file: string, severity: CheckProblem['severity'] = 'error'): CheckProblem => ({
  file,
  span: span(6, 7),
  severity,
  code: 'TS2322',
  message: "Type 'string' is not assignable to type 'number'.",
});

const report = (
  problems: readonly CheckProblem[] = [],
  project: readonly ProjectProblem[] = [],
  inputs: readonly string[] = [page, badge, helper],
): CheckReport => ({ problems, project, inputs });

const CLEAN = report();

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Let the settle timer fire and the check run. */
const settle = (): Promise<void> => vi.advanceTimersByTimeAsync(30).then(() => undefined);

describe('startLiveCheck — at start', () => {
  it('checks the whole project once, after the settle delay, and prints nothing when clean', async () => {
    const { server, told } = fakeServer();
    const checker = scripted(CLEAN);
    const live = startLiveCheck(server, root, checker);
    expect(checker.check).not.toHaveBeenCalled();
    await settle();
    expect(checker.check).toHaveBeenCalledTimes(1);
    expect(told).toEqual({ sent: [], errors: [], warnings: [], infos: [] });
    live.dispose();
  });

  it('prints every problem, the summary, and pushes the first error to the overlay', async () => {
    const { server, told } = fakeServer();
    const live = startLiveCheck(server, root, scripted(report([problem(page), problem(badge, 'warning')])));
    await settle();
    expect(told.errors[0]).toMatch(/^src\/Page\.fud:1:7 - error TS2322/u);
    expect(told.errors[1]).toBe('the typecheck failed: 1 error in 1 file');
    expect(told.warnings[0]).toMatch(/^src\/app-badge\.fud:1:7 - warning TS2322/u);
    expect(told.sent).toHaveLength(1);
    const payload = told.sent[0] as { type: string; err: OverlayError };
    expect(payload.type).toBe('error');
    expect(payload.err).toMatchObject({
      message: "TS2322: Type 'string' is not assignable to type 'number'.",
      id: page,
      plugin: 'fudic',
      loc: { file: page, line: 1, column: 7 },
    });
    expect(payload.err.frame).toContain('const n: number = "x";');
    live.dispose();
  });

  it('a project error is the one the overlay shows, and has no place', async () => {
    const { server, told } = fakeServer();
    const live = startLiveCheck(server, root, scripted(report([problem(page)], [FUD0870(), FUD0871({ reason: 'boom' })])));
    await settle();
    expect(told.warnings[0]).toContain('FUD0870');
    const payload = told.sent[0] as { err: OverlayError };
    expect(payload.err).toEqual({
      message: 'FUD0871: the typecheck could not run: boom',
      stack: '',
      plugin: 'fudic',
    });
    live.dispose();
  });

  it('a file it cannot read still reaches the overlay, without loc or frame', async () => {
    const { server, told } = fakeServer();
    const gone = `${root}/src/gone.fud`;
    const live = startLiveCheck(server, root, scripted(report([problem(gone)])));
    await settle();
    expect((told.sent[0] as { err: OverlayError }).err).toEqual({
      message: "TS2322: Type 'string' is not assignable to type 'number'.",
      stack: '',
      id: gone,
      plugin: 'fudic',
    });
    live.dispose();
  });
});

describe('startLiveCheck — which file events start a check', () => {
  async function started(): Promise<{
    watcher: EventEmitter;
    checker: ReturnType<typeof scripted>;
    live: ReturnType<typeof startLiveCheck>;
  }> {
    const { server, watcher } = fakeServer();
    const checker = scripted(CLEAN);
    const live = startLiveCheck(server, root, checker);
    await settle();
    checker.check.mockClear();
    return { watcher, checker, live };
  }

  it('a change to a file the program read: invalidate and re-check', async () => {
    const { watcher, checker, live } = await started();
    watcher.emit('all', 'change', helper);
    expect(checker.invalidate).toHaveBeenCalledWith(helper);
    await settle();
    expect(checker.check).toHaveBeenCalledTimes(1);
    live.dispose();
  });

  it('a Windows spelling of a file the program read is the same file', async () => {
    const { watcher, checker, live } = await started();
    watcher.emit('all', 'change', helper.replace(/\//gu, '\\'));
    expect(checker.invalidate).toHaveBeenCalledWith(helper);
    live.dispose();
  });

  it('a change to a file nobody read is ignored', async () => {
    const { watcher, checker, live } = await started();
    watcher.emit('all', 'change', `${root}/src/unrelated.css`);
    // Not even a `.fud`: a `.fud` the program did not read only matters when it comes or goes.
    watcher.emit('all', 'change', `${root}/src/nobody.fud`);
    await settle();
    expect(checker.invalidate).not.toHaveBeenCalled();
    expect(checker.check).not.toHaveBeenCalled();
    live.dispose();
  });

  it('a `.fud` that appears or goes away re-checks, read or not', async () => {
    const { watcher, checker, live } = await started();
    watcher.emit('all', 'add', `${root}/src/new-thing.fud`);
    watcher.emit('all', 'unlink', `${root}/src/old-thing.fud`);
    expect(checker.invalidate).toHaveBeenCalledTimes(2);
    await settle();
    // A burst of events is one check.
    expect(checker.check).toHaveBeenCalledTimes(1);
    live.dispose();
  });

  it('a tsconfig changes the options of the whole program', async () => {
    const { watcher, checker, live } = await started();
    watcher.emit('all', 'change', `${root}/tsconfig.json`);
    watcher.emit('all', 'change', `${root}/tsconfig.app.json`);
    watcher.emit('all', 'change', 'tsconfig.json');
    expect(checker.invalidate).toHaveBeenCalledTimes(3);
    watcher.emit('all', 'change', `${root}/not-tsconfig.json`);
    expect(checker.invalidate).toHaveBeenCalledTimes(3);
    live.dispose();
  });

  it('saves that keep coming push the check back: one check after they settle', async () => {
    const { watcher, checker, live } = await started();
    watcher.emit('all', 'change', helper);
    await vi.advanceTimersByTimeAsync(20);
    watcher.emit('all', 'change', page);
    await vi.advanceTimersByTimeAsync(20);
    expect(checker.check).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10);
    expect(checker.check).toHaveBeenCalledTimes(1);
    live.dispose();
  });

  it('after dispose, nothing is watched and a pending check never runs', async () => {
    const { server, watcher } = fakeServer();
    const checker = scripted(CLEAN);
    const live = startLiveCheck(server, root, checker);
    live.dispose();
    await settle();
    expect(checker.check).not.toHaveBeenCalled();
    watcher.emit('all', 'add', `${root}/src/new-thing.fud`);
    expect(checker.invalidate).not.toHaveBeenCalled();
    expect(watcher.listenerCount('all')).toBe(0);
  });

  it('dispose with no check pending only stops watching', async () => {
    const { watcher, live } = await started();
    live.dispose();
    expect(watcher.listenerCount('all')).toBe(0);
  });
});

describe('startLiveCheck — from errors to clean and back', () => {
  it('an error pushes the overlay, fixing it sends one full reload, and a clean save sends none', async () => {
    const { server, watcher, told } = fakeServer();
    const live = startLiveCheck(server, root, scripted(CLEAN, report([problem(badge)]), CLEAN, CLEAN));
    await settle();
    expect(told.sent).toEqual([]);

    watcher.emit('all', 'change', badge);
    await settle();
    expect(told.sent).toHaveLength(1);
    expect((told.sent[0] as { type: string }).type).toBe('error');

    watcher.emit('all', 'change', badge);
    await settle();
    expect(told.sent[1]).toEqual({ type: 'full-reload' });
    expect(told.infos).toEqual(['fudic: the typecheck is clean again']);

    watcher.emit('all', 'change', badge);
    await settle();
    expect(told.sent).toHaveLength(2);
    live.dispose();
  });

  it('the inputs of the latest report are what it watches', async () => {
    const { server, watcher } = fakeServer();
    const later = `${root}/src/later.ts`;
    const checker = scripted(report([], [], [page]), report([], [], [page, later]));
    const live = startLiveCheck(server, root, checker);
    await settle();
    watcher.emit('all', 'change', later);
    expect(checker.invalidate).not.toHaveBeenCalled();
    watcher.emit('all', 'change', page);
    await settle();
    watcher.emit('all', 'change', later);
    expect(checker.invalidate).toHaveBeenLastCalledWith(later);
    live.dispose();
  });
});

describe('startLiveCheck — current() and blocking()', () => {
  it('current() waits for the check in flight, and answers the last report after it', async () => {
    const { server } = fakeServer();
    const broken = report([problem(page)]);
    const live = startLiveCheck(server, root, scripted(broken));
    const pending = live.current();
    await settle();
    expect(await pending).toBe(broken);
    expect(await live.current()).toBe(broken);
    live.dispose();
  });

  it('blocking() waits for the check in flight before it answers', async () => {
    const { server } = fakeServer();
    const live = startLiveCheck(server, root, scripted(report([problem(page)])));
    let answer: OverlayError | undefined | 'pending' = 'pending';
    void live.blocking([page]).then((value) => {
      answer = value;
    });
    await Promise.resolve();
    expect(answer).toBe('pending');
    await settle();
    expect(answer).toMatchObject({ id: page, loc: { line: 1, column: 7 } });
    live.dispose();
  });

  it('an error in a file of the graph blocks the page, with loc and frame (criterion 18)', async () => {
    const { server } = fakeServer();
    const live = startLiveCheck(server, root, scripted(report([problem(helper, 'warning'), problem(badge)])));
    await settle();
    const blocked = await live.blocking([page, badge]);
    expect(blocked).toMatchObject({ id: badge, loc: { file: badge, line: 1, column: 7 } });
    expect(blocked?.frame).toContain('<app-badge></app-badge>');
    live.dispose();
  });

  it('an error outside the graph, or a warning in it, does not block the page', async () => {
    const { server } = fakeServer();
    const live = startLiveCheck(server, root, scripted(report([problem(page, 'warning'), problem(badge)])));
    await settle();
    expect(await live.blocking([page])).toBeUndefined();
    live.dispose();
  });

  it('a clean project blocks nothing', async () => {
    const { server } = fakeServer();
    const live = startLiveCheck(server, root, scripted(CLEAN));
    await settle();
    expect(await live.blocking([page, badge])).toBeUndefined();
    live.dispose();
  });

  it('a check that could not run blocks every page: nothing was verified', async () => {
    const { server } = fakeServer();
    const live = startLiveCheck(server, root, scripted(report([], [FUD0870(), FUD0871({ reason: 'boom' })])));
    await settle();
    expect(await live.blocking([])).toEqual({
      message: 'FUD0871: the typecheck could not run: boom',
      stack: '',
      plugin: 'fudic',
    });
    live.dispose();
  });

  describe('one spelling per file, case-folded where the filesystem folds case', () => {
    const platform = process.platform;
    afterEach(() => {
      Object.defineProperty(process, 'platform', { value: platform });
    });

    async function blockingAs(os: NodeJS.Platform): Promise<OverlayError | undefined> {
      Object.defineProperty(process, 'platform', { value: os });
      const { server } = fakeServer();
      const live = startLiveCheck(server, root, scripted(report([problem(page)])));
      await settle();
      const blocked = await live.blocking([page.toLowerCase().replace(/\//gu, '\\')]);
      live.dispose();
      return blocked;
    }

    it('on Windows and macOS, `Page.fud` and `page.fud` are one file', async () => {
      expect(await blockingAs('win32')).toBeDefined();
      expect(await blockingAs('darwin')).toBeDefined();
    });

    it('on Linux they are two', async () => {
      expect(await blockingAs('linux')).toBeUndefined();
    });
  });
});

describe('asError', () => {
  it('is an Error, which is what Vite’s error middleware takes from next(), carrying loc and frame', () => {
    const overlay: OverlayError = {
      message: 'TS2322: nope',
      stack: '',
      id: page,
      plugin: 'fudic',
      frame: '  1  x\n     ─',
      loc: { file: page, line: 1, column: 7 },
    };
    const error = asError(overlay);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('TS2322: nope');
    expect(error).toMatchObject({ id: page, plugin: 'fudic', frame: overlay.frame, loc: overlay.loc });
  });
});

describe('startLiveCheck over the real checker (criterion 19)', () => {
  const TSCONFIG = JSON.stringify({
    compilerOptions: { target: 'ES2024', module: 'ESNext', moduleResolution: 'bundler', strict: true, noEmit: true },
    include: ['**/*.ts', '**/*.fud'],
  });
  const BADGE = (tone: string): string => `@code {
  type Tone = ${tone};
  const { tone = 'neutral' } = props<{ tone?: Tone }>();
}

<app-badge>
  <template shadowrootmode="open"><span>@tone</span></template>
</app-badge>
`;
  const PAGE = `<!DOCTYPE html>
<html>
  <head>
    <link rel="component" href="../components/app-badge.fud">
    <title>Test</title>
  </head>
  <body>
    <app-badge .tone="@('info')">hi</app-badge>
  </body>
</html>
`;

  it('saving a component that breaks the page pushes the overlay; fixing it reloads', async () => {
    vi.useRealTimers();
    const project = toPosix(mkdtempSync(join(tmpdir(), 'fudic-live-real-')));
    const files: Record<string, string> = {
      'tsconfig.json': TSCONFIG,
      'src/components/app-badge.fud': BADGE(`'neutral' | 'info'`),
      'src/routes/index.fud': PAGE,
    };
    for (const [relative, text] of Object.entries(files)) {
      mkdirSync(dirname(join(project, relative)), { recursive: true });
      writeFileSync(join(project, relative), text);
    }
    const badgeFile = `${project}/src/components/app-badge.fud`;
    const pageFile = `${project}/src/routes/index.fud`;
    const { server, watcher, told } = fakeServer();
    // No checker given: the default is the real one, rooted at the project.
    const live = startLiveCheck(server, project);

    expect((await live.current()).problems).toEqual([]);
    expect(await live.blocking([pageFile, badgeFile])).toBeUndefined();

    // The component drops `'info'`: the page that passes it is now red, and the overlay
    // comes without anybody reloading.
    writeFileSync(badgeFile, BADGE(`'neutral' | 'success'`));
    watcher.emit('all', 'change', badgeFile);
    const broken = await live.current();
    expect(broken.problems.some((p) => p.file === pageFile && p.code === 'TS2322')).toBe(true);
    const pushed = told.sent.find((payload) => (payload as { type: string }).type === 'error') as
      | { err: OverlayError }
      | undefined;
    expect(pushed?.err.loc).toBeDefined();
    expect(pushed?.err.frame).toBeDefined();
    const blocked = await live.blocking([pageFile, badgeFile]);
    expect(blocked?.loc).toBeDefined();
    expect(blocked?.frame).toBeDefined();

    // Fixed: the page comes back by itself.
    writeFileSync(badgeFile, BADGE(`'neutral' | 'info'`));
    watcher.emit('all', 'change', badgeFile);
    expect((await live.current()).problems).toEqual([]);
    expect(told.sent[told.sent.length - 1]).toEqual({ type: 'full-reload' });
    expect(await live.blocking([pageFile, badgeFile])).toBeUndefined();
    live.dispose();
  }, 120_000);
});
