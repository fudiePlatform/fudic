import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyBenchDir, isAlive, removeBenchDir, removeTagFiles, sweepBenchDirs, writePlanFiles } from '../src/bench-dir.js';

let root: string;
let benches: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'fudic-bench-dir-'));
  benches = join(root, 'node_modules', '.fudic-bench');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('the workbench folder', () => {
  it('starts empty, with its routes folder, whatever was there', () => {
    const dir = join(benches, 'app-card');
    mkdirSync(join(dir, 'components'), { recursive: true });
    writeFileSync(join(dir, 'components', 'old.fud'), 'old');
    emptyBenchDir(dir);
    expect(readdirSync(dir)).toEqual(['routes']);
    expect(readdirSync(join(dir, 'routes'))).toEqual([]);
  });

  it('replaces one component\'s generated files with its plan, and leaves the other components\' alone', () => {
    const dir = join(benches, '100');
    emptyBenchDir(dir);
    writePlanFiles(
      dir,
      'app-card',
      new Map([
        ['routes/app-card.fud', 'M'],
        ['routes/app-card/a.fud', 'A'],
        ['routes/app-card/b.fud', 'B'],
        ['components/app-card/bench-host-app-card-b.fud', 'H'],
      ]),
    );
    writePlanFiles(dir, 'app-tabs', new Map([['routes/app-tabs.fud', 'T'], ['routes/app-tabs/x.fud', 'X']]));
    writeFileSync(join(dir, 'keep.txt'), 'not generated');
    writePlanFiles(dir, 'app-card', new Map([['routes/app-card.fud', 'M'], ['routes/app-card/a.fud', 'A2']]));
    expect(readdirSync(join(dir, 'routes')).sort()).toEqual(['app-card', 'app-card.fud', 'app-tabs', 'app-tabs.fud']);
    expect(readdirSync(join(dir, 'routes', 'app-card'))).toEqual(['a.fud']);
    expect(readFileSync(join(dir, 'routes', 'app-card', 'a.fud'), 'utf8')).toBe('A2');
    expect(readdirSync(join(dir, 'routes', 'app-tabs'))).toEqual(['x.fud']);
    expect(existsSync(join(dir, 'components', 'app-card'))).toBe(false);
    expect(existsSync(join(dir, 'keep.txt'))).toBe(true);
  });

  it('removes one component\'s files on close of that component, and nothing else', () => {
    const dir = join(benches, '100');
    emptyBenchDir(dir);
    writePlanFiles(dir, 'app-card', new Map([['routes/app-card.fud', 'M'], ['components/app-card/h.fud', 'H']]));
    writePlanFiles(dir, 'app-tabs', new Map([['routes/app-tabs.fud', 'T']]));
    removeTagFiles(dir, 'app-card');
    expect(readdirSync(join(dir, 'routes'))).toEqual(['app-tabs.fud']);
    expect(readdirSync(join(dir, 'components'))).toEqual([]);
    expect(() => removeTagFiles(dir, 'nobody')).not.toThrow();
  });

  it('is removed on close, with .fudic-bench when no other workbench is left', () => {
    const card = join(benches, 'app-card');
    const tabs = join(benches, 'app-tabs');
    emptyBenchDir(card);
    emptyBenchDir(tabs);
    removeBenchDir(card);
    expect(readdirSync(benches)).toEqual(['app-tabs']);
    removeBenchDir(tabs);
    expect(existsSync(benches)).toBe(false);
    expect(existsSync(join(root, 'node_modules'))).toBe(true);
  });

  it('closes quietly when node_modules went away under it (a pnpm install)', () => {
    const card = join(benches, 'app-card');
    emptyBenchDir(card);
    rmSync(join(root, 'node_modules'), { recursive: true, force: true });
    expect(() => removeBenchDir(card)).not.toThrow();
  });
});

describe('sweepBenchDirs — criterion 4, the folders of dead processes', () => {
  it('deletes the folders of dead pids and of the old per-tag layout, and keeps the live ones and its own', () => {
    const own = join(benches, '100');
    for (const name of ['100', '200', '300', 'app-card']) {
      emptyBenchDir(join(benches, name));
    }
    sweepBenchDirs(own, (pid) => pid === 200);
    expect(readdirSync(benches).sort()).toEqual(['100', '200']);
  });

  it('asks the system by default: its own process is alive', () => {
    const own = join(benches, String(process.pid));
    const live = join(benches, String(process.ppid));
    emptyBenchDir(own);
    emptyBenchDir(live);
    sweepBenchDirs(own);
    expect(readdirSync(benches).sort()).toEqual([String(process.pid), String(process.ppid)].sort());
  });

  it('does nothing when there is no .fudic-bench yet', () => {
    expect(() => sweepBenchDirs(join(benches, '100'), () => false)).not.toThrow();
    expect(existsSync(benches)).toBe(false);
  });
});

describe('isAlive', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is true for this process', () => {
    expect(isAlive(process.pid)).toBe(true);
  });

  it('is false for a pid nobody has', () => {
    vi.spyOn(process, 'kill').mockImplementation(() => {
      throw Object.assign(new Error('kill ESRCH'), { code: 'ESRCH' });
    });
    expect(isAlive(999_999)).toBe(false);
  });

  it('is true for a process that is not ours to signal (EPERM)', () => {
    vi.spyOn(process, 'kill').mockImplementation(() => {
      throw Object.assign(new Error('kill EPERM'), { code: 'EPERM' });
    });
    expect(isAlive(4)).toBe(true);
  });
});
