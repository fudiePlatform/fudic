/**
 * SDD-65 §3.1, §3.3 and §5: `record` appends one line to the piece's `.fudlog`, next to its
 * `.fud`, creating it when missing; it never rewrites what is already there.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { git } from '../src/io.js';
import { historyOf, nodeIo, parseHistory, record, type HistoryEvent } from '../src/index.js';
import { instantOf } from '../src/record.js';
import { memoryIo, ROOT } from './memory-io.js';

const UNIT = 'src/components/acme-button/acme-button.fud';
const LOG = 'src/components/acme-button/acme-button.fudlog';
const HASH = '2b8f3c91aa04';

describe('historyOf (§3.1)', () => {
  it('puts the .fudlog next to the .fud, with its name', () => {
    expect(historyOf(UNIT)).toBe(LOG);
    expect(historyOf('src/routes/blog/index.fud')).toBe('src/routes/blog/index.fudlog');
  });

  it('only drops a final .fud', () => {
    expect(historyOf('src/components/a.fud/b.fud')).toBe('src/components/a.fud/b.fudlog');
    expect(historyOf('src/components/a/a')).toBe('src/components/a/a.fudlog');
  });
});

describe('instantOf (§3.2)', () => {
  it('is UTC to the minute', () => {
    expect(instantOf(new Date('2026-10-22T10:02:59.999Z'))).toBe('2026-10-22T10:02Z');
    expect(instantOf(new Date('2026-10-22T23:30:00+02:00'))).toBe('2026-10-22T21:30Z');
  });
});

describe('record', () => {
  it('creates the .fudlog with one line: the instant, the short HEAD and the event', async () => {
    const io = memoryIo({ head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678' });
    await record(UNIT, { kind: 'started', by: 'agent', text: 'Button' }, io);
    expect(io.text(LOG)).toBe('2026-10-22T10:02Z a1b2c3d started     by agent  "Button"\n');
  });

  it('writes the no-commit mark outside git or before the first commit', async () => {
    const io = memoryIo();
    await record(UNIT, { kind: 'done' }, io);
    expect(io.text(LOG)).toBe('2026-10-22T10:02Z ------- done\n');
  });

  it('only appends: what was there stays a prefix of what is there (§5)', async () => {
    const io = memoryIo({ head: '0a9b8c7ffff' });
    const events: readonly HistoryEvent[] = [
      { kind: 'approved', by: 'pedro', criteria: 4, hash: HASH },
      { kind: 'tests', verdict: 'red', passed: 0, total: 6, hash: HASH },
      { kind: 'spec_run', verdict: 'fail', passed: 3, total: 4, hash: HASH, failing: ['disabled-no-press'] },
      { kind: 'done' },
    ];
    let before = '';
    for (const [i, event] of events.entries()) {
      io.at(`2026-10-22T10:${String(10 + i).padStart(2, '0')}:00Z`);
      await record(UNIT, event, io);
      const after = io.text(LOG)!;
      expect(after.startsWith(before)).toBe(true);
      expect(after.slice(before.length).split('\n')).toHaveLength(2);
      before = after;
    }
    const { value, diagnostics } = parseHistory(before);
    expect(diagnostics).toEqual([]);
    expect(value.map((line) => line.event)).toEqual(events);
  });

  it('gives a history cut without its last line ending a line of its own', async () => {
    const cut = '2026-10-22T10:00Z ------- done';
    const io = memoryIo({ files: { [LOG]: cut } });
    await record(UNIT, { kind: 'connected', functions: ['save'] }, io);
    expect(io.text(LOG)).toBe(`${cut}\n2026-10-22T10:02Z ------- connected   save\n`);
    expect(parseHistory(io.text(LOG)!).value).toHaveLength(2);
  });

  it('adds no blank line to an empty file nor to one that ends its last line', async () => {
    const io = memoryIo({ files: { [LOG]: '', 'src/routes/index.fudlog': '2026-10-22T10:00Z ------- done\r\n' } });
    await record(UNIT, { kind: 'done' }, io);
    await record('src/routes/index.fud', { kind: 'done' }, io);
    expect(io.text(LOG)).toBe('2026-10-22T10:02Z ------- done\n');
    expect(io.text('src/routes/index.fudlog')).toBe('2026-10-22T10:00Z ------- done\r\n2026-10-22T10:02Z ------- done\n');
  });

  it('resolves the piece against the root', () => {
    expect(resolve(ROOT, historyOf(UNIT))).toBe(join(ROOT, 'src', 'components', 'acme-button', 'acme-button.fudlog'));
  });
});

describe('on disk (nodeIo)', () => {
  const dirs: string[] = [];
  const temp = (): string => {
    const dir = mkdtempSync(join(tmpdir(), 'fudic-history-'));
    dirs.push(dir);
    return dir;
  };

  afterEach(() => {
    vi.restoreAllMocks();
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('reads a missing file as undefined, appends and creates, and tells the time', async () => {
    const root = temp();
    const io = nodeIo(root);
    expect(io.root).toBe(root);
    const file = join(root, 'a.fudlog');
    expect(await io.read(file)).toBeUndefined();
    await io.append(file, 'one\n');
    await io.append(file, 'two\n');
    expect(await io.read(file)).toBe('one\ntwo\n');
    const before = Date.now();
    expect(io.now().getTime()).toBeGreaterThanOrEqual(before);
  });

  it('has no HEAD outside git', async () => {
    expect(await nodeIo(temp()).head()).toBeUndefined();
  });

  it('asks git, and answers undefined when git fails', async () => {
    const root = temp();
    expect(await git(root, ['--version'])).toMatch(/^git version /u);
    expect(await git(root, ['rev-parse', 'HEAD'])).toBeUndefined();
  });

  it('records next to the .fud by default, under the working directory', async () => {
    const root = temp();
    vi.spyOn(process, 'cwd').mockReturnValue(root);
    writeFileSync(join(root, 'a.fud'), '');
    await record('a.fud', { kind: 'done' });
    expect(readFileSync(join(root, 'a.fudlog'), 'utf8')).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z ------- done\n$/u);
    expect(nodeIo().root).toBe(root);
  });
});
