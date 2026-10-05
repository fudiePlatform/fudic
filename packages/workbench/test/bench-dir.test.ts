import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { emptyBenchDir, removeBenchDir, writePlanFiles } from '../src/bench-dir.js';

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

  it('replaces the generated files with the plan, and a criterion that is gone loses its page', () => {
    const dir = join(benches, 'app-card');
    emptyBenchDir(dir);
    writePlanFiles(dir, new Map([['routes/a.fud', 'A'], ['routes/b.fud', 'B'], ['components/bench-host-b.fud', 'H']]));
    writeFileSync(join(dir, 'keep.txt'), 'not generated');
    writePlanFiles(dir, new Map([['routes/a.fud', 'A2']]));
    expect(readdirSync(join(dir, 'routes'))).toEqual(['a.fud']);
    expect(readFileSync(join(dir, 'routes', 'a.fud'), 'utf8')).toBe('A2');
    expect(existsSync(join(dir, 'components'))).toBe(false);
    expect(existsSync(join(dir, 'keep.txt'))).toBe(true);
  });

  it('keeps the routes folder for a plan without files', () => {
    const dir = join(benches, 'app-card');
    writePlanFiles(dir, new Map());
    expect(readdirSync(join(dir, 'routes'))).toEqual([]);
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
