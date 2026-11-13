/**
 * The checker the server keeps (SDD-77 §4.1, §8.2.11, §8.2.12): one for the life of the server,
 * told by the dates of the files what changed, with `.fudic/api` written before every check.
 */

import { mkdirSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Cli } from '../src/fudic.js';
import type { CheckProblem, CheckReport, ProjectChecker } from '@fudic/typecheck';
import { Checks, stampsOf, type Stamps } from '../src/checks.js';
import type { Fudic } from '../src/fudic.js';
import { tempDir } from './helpers.js';

let dir: ReturnType<typeof tempDir> | undefined;

afterEach(() => {
  dir?.dispose();
  dir = undefined;
});

describe('stampsOf', () => {
  it('every file with its date, but under node_modules, dist and .git', () => {
    dir = tempDir();
    const files = ['a.fud', 'src/b.fud', 'src/deep/c.ts', 'node_modules/x/i.js', 'dist/o.js', '.git/HEAD', 'src/node_modules/y.js', '.fudic/api/r.d.ts'];
    for (const file of files) {
      mkdirSync(join(dir.root, file, '..'), { recursive: true });
      writeFileSync(join(dir.root, file), '');
    }
    utimesSync(join(dir.root, 'a.fud'), 1000, 1000);
    // A link is not a file of the project: what it points at is somebody else's.
    symlinkSync(join(dir.root, 'src'), join(dir.root, 'linked'), 'junction');
    const stamps = stampsOf(dir.root);
    expect([...stamps.keys()].map((p) => p.slice(dir!.root.length + 1).replace(/\\/gu, '/')).sort()).toEqual([
      '.fudic/api/r.d.ts',
      'a.fud',
      'src/b.fud',
      'src/deep/c.ts',
    ]);
    expect(stamps.get(join(dir.root, 'a.fud'))).toBe(1_000_000);
  });
});

/** A checker that remembers what it was told, and answers `report`. */
function fakeChecker(report: CheckReport): ProjectChecker & { readonly invalidated: string[] } {
  const invalidated: string[] = [];
  return {
    invalidated,
    check: vi.fn(() => report),
    invalidate: (path: string) => void invalidated.push(path),
    propShapes: () => undefined,
    languageService: () => undefined,
  } as unknown as ProjectChecker & { invalidated: string[] };
}

const EMPTY: CheckReport = { problems: [], project: [], inputs: [] };

function harness(stamps: Stamps[], projects: (root: string) => readonly string[] = (root) => [root]): { checks: Checks; checker: ReturnType<typeof fakeChecker>; fudic: Fudic; load: ReturnType<typeof vi.fn>; write: ReturnType<typeof vi.fn> } {
  dir = tempDir();
  const checker = fakeChecker(EMPTY);
  const write = vi.fn(() => []);
  const fudic: Fudic = {
    createProjectChecker: vi.fn(() => checker) as unknown as Fudic['createProjectChecker'],
    writeApiDeclarations: write as unknown as Fudic['writeApiDeclarations'],
    cli: {} as Cli,
    from: { check: 'server', cli: 'server' },
  };
  const load = vi.fn(() => Promise.resolve(fudic));
  let i = 0;
  const checks = new Checks(dir.root, { load, stamps: () => stamps[Math.min(i++, stamps.length - 1)]!, projects });
  return { checks, checker, fudic, load, write };
}

describe('Checks.run', () => {
  it('loads the project\'s fudic once, and makes one checker at the root', async () => {
    const { checks, fudic, load } = harness([new Map()]);
    await checks.run();
    await checks.run();
    expect(await checks.fudic()).toBe(fudic);
    expect(load).toHaveBeenCalledOnce();
    expect(load).toHaveBeenCalledWith(dir!.root);
    expect(fudic.createProjectChecker).toHaveBeenCalledExactlyOnceWith({ root: dir!.root, headers: true });
  });

  it('writes .fudic/api before every check, as the build does', async () => {
    const { checks, checker, write } = harness([new Map()]);
    await checks.run();
    expect(write).toHaveBeenCalledWith(dir!.root);
    expect(write.mock.invocationCallOrder[0]!).toBeLessThan((checker.check as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]!);
  });

  it('tells the checker what changed and what went, by date, and nothing that did not', async () => {
    const { checks, checker } = harness([
      new Map([['/p/a.fud', 1], ['/p/b.fud', 1], ['/p/c.fud', 1]]),
      new Map([['/p/a.fud', 1], ['/p/b.fud', 2], ['/p/d.fud', 1]]),
      new Map([['/p/a.fud', 1], ['/p/b.fud', 2], ['/p/d.fud', 1]]),
    ]);
    await checks.run();
    expect(checker.invalidated).toEqual(['/p/a.fud', '/p/b.fud', '/p/c.fud']);
    checker.invalidated.length = 0;
    expect(await checks.run()).toEqual(EMPTY);
    expect(checker.invalidated).toEqual(['/p/b.fud', '/p/d.fud', '/p/c.fud']);
    checker.invalidated.length = 0;
    await checks.run();
    expect(checker.invalidated).toEqual([]);
  });
});

describe('a workspace', () => {
  it('one checker per project, each with the fudic it installed, and one report in their order', async () => {
    const problem = (file: string): CheckProblem => ({ file, span: { start: 0, end: 1 }, severity: 'error', code: 'FUD0001', message: 'x' });
    const { checks, fudic, load, write } = harness([new Map([['/w/apps/web/a.fud', 1]])], (root) => [`${root}/apps/web`, `${root}/libs/ui`]);
    const reports: Record<string, CheckReport> = {
      web: { problems: [problem('/w/apps/web/a.fud')], project: [], inputs: ['a'] },
      ui: { problems: [problem('/w/libs/ui/b.fud')], project: [{ severity: 'warning', code: 'FUD0870', message: 'y' }], inputs: ['b'] },
    };
    const made = vi.fn(({ root }: { root: string }) => fakeChecker(reports[root.endsWith('web') ? 'web' : 'ui']!));
    (fudic as { createProjectChecker: unknown }).createProjectChecker = made;
    const report = await checks.run();
    expect(load.mock.calls.map(([root]) => root)).toEqual([dir!.root, `${dir!.root}/apps/web`, `${dir!.root}/libs/ui`]);
    expect(write.mock.calls.map(([root]) => root)).toEqual([`${dir!.root}/apps/web`, `${dir!.root}/libs/ui`]);
    expect(report.problems.map((p) => p.file)).toEqual(['/w/apps/web/a.fud', '/w/libs/ui/b.fud']);
    expect(report.project.map((p) => p.code)).toEqual(['FUD0870']);
    expect(report.inputs).toEqual(['a', 'b']);
    expect(await checks.folders()).toEqual([`${dir!.root}/apps/web`, `${dir!.root}/libs/ui`]);
  });
});

describe('Checks.reset and Checks.service', () => {
  it('reset forgets the fudic and the dates: the next run mounts again and tells everything', async () => {
    const { checks, checker, load } = harness([new Map([['/p/a.fud', 1]])]);
    await checks.run();
    checker.invalidated.length = 0;
    checks.reset();
    await checks.run();
    expect(load).toHaveBeenCalledTimes(2);
    expect(checker.invalidated).toEqual(['/p/a.fud']);
  });

  it('the editor\'s project service, the same one every time', async () => {
    const { checks } = harness([new Map()]);
    const service = await checks.service();
    expect(typeof service.repairs).toBe('function');
    expect(await checks.service()).toBe(service);
  });
});

describe('Checks.repairs', () => {
  const problem = (code: string): CheckProblem => ({ file: '/p/a.fud', span: { start: 0, end: 1 }, severity: 'error', code, message: 'x' });

  it('none for a TypeScript problem, without even mounting', async () => {
    const { checks, load } = harness([new Map()]);
    expect(await checks.repairs(problem('TS2322'))).toEqual([]);
    expect(load).not.toHaveBeenCalled();
  });

  it('a fudic problem asks the editor\'s service', async () => {
    const { checks } = harness([new Map()]);
    expect(await checks.repairs(problem('FUD9999'))).toEqual([]);
  });
});

describe('the real disk', () => {
  it('by default, what the agent writes with its own tools is seen by its date', async () => {
    dir = tempDir({ 'fudic.json': '{}', 'tsconfig.json': JSON.stringify({ include: ['src/**/*.fud'] }) });
    mkdirSync(join(dir.root, 'src'));
    const checks = new Checks(dir.root);
    expect((await checks.run()).problems).toEqual([]);
    writeFileSync(join(dir.root, 'src', 'x.fud'), '<p>\n');
    const report = await checks.run();
    expect(report.problems.map((p) => p.code)).not.toEqual([]);
    rmSync(join(dir.root, 'src', 'x.fud'));
    expect((await checks.run()).problems).toEqual([]);
  }, 120_000);
});
