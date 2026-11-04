/**
 * SDD-65 criterion 3: two branches that add lines to one `.fudlog` merge with `git merge` and
 * no conflict, thanks to `*.fudlog merge=union`, and `parseHistory` gives them by instant.
 *
 * The `.gitattributes` line is written here by hand: `fudic new` writing it is criterion 15.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type HistoryEvent, type HistoryIo, nodeIo, parseHistory, record } from '../src/index.js';

const UNIT = 'src/components/acme-button/acme-button.fud';
const LOG = 'src/components/acme-button/acme-button.fudlog';

let repo: string;

const sh = (...args: string[]): string =>
  execFileSync('git', args, { cwd: repo, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** The disk and git of the repository, with the clock held at one instant. */
const at = (iso: string): HistoryIo => ({ ...nodeIo(repo), now: () => new Date(iso) });

const commitAll = (message: string): void => {
  sh('add', '-A');
  sh('commit', '-q', '-m', message);
};

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'fudic-history-merge-'));
  sh('init', '-q', '-b', 'main');
  sh('config', 'user.name', 'Pedro Hurtado');
  sh('config', 'user.email', 'pedro@example.com');
  sh('config', 'core.autocrlf', 'false');
  sh('config', 'commit.gpgsign', 'false');
  writeFileSync(join(repo, '.gitattributes'), '*.fudlog merge=union\n');
  mkdirSync(join(repo, 'src/components/acme-button'), { recursive: true });
  writeFileSync(join(repo, UNIT), '<acme-button></acme-button>\n');
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe('merge (criterion 3)', () => {
  it('joins the lines of two branches without conflict, and reads them by instant', async () => {
    await record(UNIT, { kind: 'started', by: 'agent', text: 'Button' }, at('2026-10-22T10:00:00Z'));
    commitAll('start');
    const base = sh('rev-parse', 'HEAD').slice(0, 7);

    sh('checkout', '-q', '-b', 'feature');
    const feature: readonly HistoryEvent[] = [
      { kind: 'approved', by: 'ana', criteria: 4, hash: '2b8f3c91aa04' },
      { kind: 'tests', verdict: 'red', passed: 0, total: 6, hash: '91c2e7d40b18' },
    ];
    await record(UNIT, feature[0]!, at('2026-10-22T10:10:00Z'));
    await record(UNIT, feature[1]!, at('2026-10-22T10:30:00Z'));
    commitAll('feature work');

    sh('checkout', '-q', 'main');
    const main: readonly HistoryEvent[] = [
      { kind: 'documented', documented: 2, props: 3 },
      { kind: 'connected', functions: ['save'] },
    ];
    await record(UNIT, main[0]!, at('2026-10-22T10:20:00Z'));
    await record(UNIT, main[1]!, at('2026-10-22T10:40:00Z'));
    commitAll('main work');

    // Throws on a conflict: git exits with 1.
    sh('merge', '-q', '--no-edit', 'feature');
    expect(sh('status', '--porcelain')).toBe('');

    const text = readFileSync(join(repo, LOG), 'utf8');
    expect(text).not.toMatch(/^(<<<<<<<|=======|>>>>>>>)/mu);
    const { value, diagnostics } = parseHistory(text, LOG);
    expect(diagnostics).toEqual([]);
    // In the file the two blocks follow one another (ours, then theirs); read, they interleave.
    expect(value.map((line) => line.at)).toEqual([
      '2026-10-22T10:00Z',
      '2026-10-22T10:10Z',
      '2026-10-22T10:20Z',
      '2026-10-22T10:30Z',
      '2026-10-22T10:40Z',
    ]);
    expect(value.map((line) => line.event)).toEqual([
      { kind: 'started', by: 'agent', text: 'Button' },
      feature[0],
      main[0],
      feature[1],
      main[1],
    ]);
    // Every line carries the commit HEAD was at when it was written.
    expect(value[0]!.commit).toBe('-------');
    expect(value.slice(1).every((line) => line.commit === base)).toBe(true);
  });

  it('without the attribute, the same two branches conflict', async () => {
    writeFileSync(join(repo, '.gitattributes'), '');
    await record(UNIT, { kind: 'done' }, at('2026-10-22T10:00:00Z'));
    commitAll('start');
    sh('checkout', '-q', '-b', 'feature');
    await record(UNIT, { kind: 'connected', functions: ['a'] }, at('2026-10-22T10:10:00Z'));
    commitAll('feature');
    sh('checkout', '-q', 'main');
    await record(UNIT, { kind: 'connected', functions: ['b'] }, at('2026-10-22T10:20:00Z'));
    commitAll('main');
    expect(() => sh('merge', '-q', '--no-edit', 'feature')).toThrow();
  });
});
