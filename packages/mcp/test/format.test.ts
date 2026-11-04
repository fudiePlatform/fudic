/**
 * `fudic_format` (SDD-77 §4.5, §8.2.23, criterion 14): the plan of `fudic fmt`, read by the CLI's
 * own parser, its diff, and applied unless dry — or not at all when a file does not parse.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as cli from '@fudic/cli';
import type { Checks } from '../src/checks.js';
import { formatProject } from '../src/format.js';
import { openProject } from '../src/project.js';
import { createServer } from '../src/server.js';
import { connect, tempDir } from './helpers.js';

const UGLY = '<p>\n<span>x</span>\n</p>\n';
const BROKEN = '<p>\n  <span>x\n</p>\n';

let dir: ReturnType<typeof tempDir>;

beforeEach(() => {
  dir = tempDir({ 'fudic.json': '{}', 'a.fud': UGLY, 'c.fud': '<p>x</p>\n' });
});

afterEach(() => {
  dir.dispose();
});

const withCli = (own: unknown = cli): Checks => ({ fudic: () => Promise.resolve({ cli: own }) }) as unknown as Checks;

const format = (input: { paths?: readonly string[]; dryRun?: boolean } = {}, checks = withCli()): ReturnType<typeof formatProject> =>
  formatProject(openProject(dir.root, () => 'x'), checks, { dryRun: false, ...input });

const text = (path: string): string => readFileSync(join(dir.root, path), 'utf8');

/** What `fudic fmt` makes of a file. */
async function formatted(path: string): Promise<{ contents: string; diff: string }> {
  const command = cli.parseArgs(['fmt', path, '--cwd', dir.root]);
  if (command.kind !== 'fmt') throw new Error(command.kind);
  const plan = await cli.planFmt(command.paths, command.opts);
  return { contents: plan.changes[0]!.contents, diff: plan.changes.flatMap((c) => cli.formatDiff(c)).join('\n') };
}

describe('formatProject', () => {
  it('the project: the diff of fudic fmt, applied', async () => {
    const expected = await formatted('a.fud');
    const answer = await format();
    expect(answer.body).toEqual({ formatted: ['a.fud'], written: true, diff: expected.diff });
    expect(answer.diagnostics).toEqual([]);
    expect(answer.next).toBeNull();
    expect(text('a.fud')).toBe(expected.contents);
    expect(text('a.fud')).not.toBe(UGLY);
  });

  it('a dry run: the same diff, nothing written', async () => {
    const answer = await format({ dryRun: true });
    expect(answer.body).toMatchObject({ formatted: ['a.fud'], written: false });
    expect(answer.body['diff']).not.toBe('');
    expect(text('a.fud')).toBe(UGLY);
  });

  it('only the paths asked for; the project itself is "."', async () => {
    expect((await format({ paths: ['c.fud'] })).body).toEqual({ formatted: [], written: false, diff: '' });
    expect(text('a.fud')).toBe(UGLY);
    expect((await format({ paths: ['.'], dryRun: true })).body).toMatchObject({ formatted: ['a.fud'] });
  });

  it('a file that does not parse: nothing is formatted, its problems are said where they are', async () => {
    const broken = tempDir({ 'fudic.json': '{}', 'a.fud': UGLY, 'b.fud': BROKEN });
    try {
      const answer = await formatProject(openProject(broken.root, () => 'x'), withCli(), { dryRun: false });
      expect(answer.body).toMatchObject({ formatted: ['a.fud'], written: false });
      expect(readFileSync(join(broken.root, 'a.fud'), 'utf8')).toBe(UGLY);
      expect(answer.diagnostics?.map((d) => [d.code, d.file])).toEqual([
        ['FUD0450', `${broken.root}/b.fud`],
        ['FUD0052', `${broken.root}/b.fud`],
      ]);
      expect(answer.next).toBe('Fix the files that do not parse; nothing was formatted.');
    } finally {
      broken.dispose();
    }
  });

  it('a CLI whose error names no file: said as it came', async () => {
    const own = {
      ...cli,
      planFmt: () => Promise.resolve({ changes: [], commands: [], diagnostics: [], errors: [{ severity: 'error', code: 'FUD0450', message: 'nothing to format' }] }),
    };
    const answer = await format({}, withCli(own));
    expect(answer.diagnostics).toEqual([{ severity: 'error', code: 'FUD0450', message: 'nothing to format' }]);
  });

  it('no fudic project: FUD1404; a path out of it: FUD1400', async () => {
    const plain = tempDir();
    try {
      expect((await formatProject(openProject(plain.root, () => 'x'), withCli(), { dryRun: false })).diagnostics?.map((d) => d.code)).toEqual(['FUD1404']);
    } finally {
      plain.dispose();
    }
    const out = await format({ paths: ['../x'] });
    expect(out.failed).toBe(true);
    expect(out.diagnostics?.map((d) => d.code)).toEqual(['FUD1400']);
  });
});

describe('fudic_format over a client (criterion 14)', () => {
  it('a badly indented .fud: the diff of fudic fmt, and the file formatted on disk', async () => {
    const expected = await formatted('a.fud');
    const client = await connect(createServer({ project: openProject(dir.root, () => 'b59fa7d'), entry: 'stdio' }));
    try {
      const result = await client.callTool({ name: 'fudic_format', arguments: { paths: ['a.fud'] } });
      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toMatchObject({ formatted: ['a.fud'], written: true, diff: expected.diff, diagnostics: [], next: null });
      expect(text('a.fud')).toBe(expected.contents);
    } finally {
      await client.close();
    }
  }, 120_000);
});
