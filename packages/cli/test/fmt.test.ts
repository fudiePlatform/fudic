/**
 * `fudic fmt` (SDD-26 §3 and task 32).
 *
 * The CLI half of "one formatter for the editor and the pipeline": everything about HOW a
 * `.fud` is laid out lives in `@fudic/formatter`, and this command is a plan over it.
 */

import { describe, expect, it } from 'vitest';
import { parseArgs } from '../src/args.js';
import { filesOf, planFmt } from '../src/plans/fmt.js';
import { run } from '../src/run.js';
import { captureStreams, MemoryFs, RecordingRunner } from './helpers.js';
import type { FmtOptions } from '../src/types.js';

const options = (over: Partial<FmtOptions> = {}): FmtOptions => ({
  cwd: '/project',
  force: false,
  check: false,
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  quote: 'double',
  endOfLine: 'lf',
  ...over,
});

const MESSY = '<app-x>\n  <template shadowrootmode="open">\n      <p>a</p>\n  </template>\n</app-x>\n';
const TIDY = '<app-x>\n  <template shadowrootmode="open">\n    <p>a</p>\n  </template>\n</app-x>\n';
const BROKEN = '<app-x>\n  <template shadowrootmode="open">\n    <p>a\n  </template>\n</app-x>\n';

describe('parseArgs fmt', () => {
  it('defaults to the whole working directory', () => {
    const command = parseArgs(['fmt']);
    expect(command.kind === 'fmt' && command.paths).toEqual(['.']);
  });

  it('takes the paths it is given, and the six options', () => {
    const command = parseArgs([
      'fmt', 'a.fud', 'components',
      '--check', '--print-width', '60', '--tab-width', '4',
      '--use-tabs', '--quote', 'single', '--end-of-line', 'crlf',
    ]);
    expect(command.kind).toBe('fmt');
    if (command.kind !== 'fmt') return;
    expect(command.paths).toEqual(['a.fud', 'components']);
    expect(command.opts).toMatchObject({
      check: true,
      printWidth: 60,
      tabWidth: 4,
      useTabs: true,
      quote: 'single',
      endOfLine: 'crlf',
    });
  });

  it('rejects a value it cannot use, rather than guessing one', () => {
    expect(parseArgs(['fmt', '--quote', 'curly']).kind).toBe('error');
    expect(parseArgs(['fmt', '--end-of-line', 'cr']).kind).toBe('error');
    expect(parseArgs(['fmt', '--print-width', 'wide']).kind).toBe('error');
    expect(parseArgs(['fmt', '--tab-width', 'some']).kind).toBe('error');
    expect(parseArgs(['fmt', '--colour', 'always']).kind).toBe('error');
  });
});

describe('filesOf', () => {
  const fs = new MemoryFs({
    'a.fud': MESSY,
    'components/b.fud': MESSY,
    'components/notes.md': 'x',
    'node_modules/pkg/c.fud': MESSY,
  });

  it('walks a directory, takes a file, and never descends into node_modules', () => {
    expect(filesOf(['.'], options(), fs)).toEqual(['a.fud', 'components/b.fud']);
    expect(filesOf(['components'], options(), fs)).toEqual(['components/b.fud']);
    expect(filesOf(['a.fud'], options(), fs)).toEqual(['a.fud']);
  });

  it('ignores what is neither, without complaining', () => {
    expect(filesOf(['components/notes.md', 'missing.fud'], options(), fs)).toEqual([]);
  });

  it('lists a file once however many ways it was named', () => {
    expect(filesOf(['.', 'a.fud', 'components'], options(), fs)).toEqual([
      'a.fud',
      'components/b.fud',
    ]);
  });
});

describe('planFmt', () => {
  it('plans a modification only for the files that would change', async () => {
    const fs = new MemoryFs({ 'a.fud': MESSY, 'b.fud': TIDY });
    const plan = await planFmt(['.'], options(), fs);
    expect(plan.changes.map((c) => c.path)).toEqual(['a.fud']);
    expect(plan.changes[0]?.contents).toBe(TIDY);
  });

  it('reports a file that does not parse and leaves it alone', async () => {
    const fs = new MemoryFs({ 'broken.fud': BROKEN });
    const plan = await planFmt(['.'], options(), fs);
    expect(plan.changes).toEqual([]);
    expect(plan.errors[0]?.code).toBe('FUD0450');
    expect(plan.diagnostics.length).toBeGreaterThan(0);
  });

  it('reports the notes of the formatter without refusing the file', async () => {
    const fs = new MemoryFs({ 'a.fud': '<p>@(a ===)</p>\n' });
    const plan = await planFmt(['.'], options(), fs);
    expect(plan.errors).toEqual([]);
    expect(plan.diagnostics.map((d) => d.diagnostic.code)).toEqual(['FUD0481']);
  });

  it('passes the options straight through to the formatter', async () => {
    const fs = new MemoryFs({ 'a.fud': MESSY });
    const plan = await planFmt(['.'], options({ useTabs: true }), fs);
    expect(plan.changes[0]?.contents).toContain('\t<template');
  });
});

describe('the command end to end', () => {
  const deps = (fs: MemoryFs) => {
    const capture = captureStreams();
    return {
      deps: { readIo: fs, writeIo: fs, runner: new RecordingRunner(), streams: capture.streams },
      capture,
    };
  };

  it('writes the formatted file', async () => {
    const fs = new MemoryFs({ 'a.fud': MESSY });
    const { deps: d } = deps(fs);
    expect(await run(['fmt', '--cwd', '/project'], d)).toBe(0);
    expect(fs.at('a.fud')).toBe(TIDY);
  });

  it('--check writes nothing and exits non-zero when something would change', async () => {
    const fs = new MemoryFs({ 'a.fud': MESSY });
    const { deps: d, capture } = deps(fs);
    expect(await run(['fmt', '--check', '--cwd', '/project'], d)).toBe(1);
    expect(fs.at('a.fud')).toBe(MESSY);
    expect(capture.stdout()).toContain('would format  a.fud');
  });

  it('--check exits zero when the project is already formatted', async () => {
    const fs = new MemoryFs({ 'a.fud': TIDY });
    const { deps: d } = deps(fs);
    expect(await run(['fmt', '--check', '--cwd', '/project'], d)).toBe(0);
  });

  it('exits 2 on a file it could not read, and leaves it as it was', async () => {
    const fs = new MemoryFs({ 'broken.fud': BROKEN });
    const { deps: d } = deps(fs);
    expect(await run(['fmt', '--cwd', '/project'], d)).toBe(2);
    expect(fs.at('broken.fud')).toBe(BROKEN);
  });

  it('--dry-run shows the diff and writes nothing', async () => {
    const fs = new MemoryFs({ 'a.fud': MESSY });
    const { deps: d, capture } = deps(fs);
    expect(await run(['fmt', '--dry-run', '--cwd', '/project'], d)).toBe(0);
    expect(fs.at('a.fud')).toBe(MESSY);
    expect(capture.stdout()).toContain('dry run');
  });
});

describe('fmt over .fudspec files (SDD-53 criterion 23)', () => {
  const SPEC_MESSY = 'component app-x\ncriterion a\n   then   \n      visible   app-x\n';
  const SPEC_TIDY = 'component app-x\n\ncriterion a\n  then\n    visible app-x\n';
  const SPEC_BROKEN = 'component app-x\ncriterion a\n  then\n    text app-x "unclosed\n';

  const deps = (fs: MemoryFs) => {
    const capture = captureStreams();
    return { capture, deps: { readIo: fs, writeIo: fs, runner: new RecordingRunner(), streams: capture.streams } };
  };

  it('walks .fud and .fudspec together, takes a single .fudspec, and skips node_modules', () => {
    const fs = new MemoryFs({
      'a.fud': MESSY,
      'src/b.fudspec': SPEC_MESSY,
      'src/c.fixture.ts': 'export default {};\n',
      'node_modules/pkg/d.fudspec': SPEC_MESSY,
    });
    expect(filesOf(['.'], options(), fs)).toEqual(['a.fud', 'src/b.fudspec']);
    expect(filesOf(['src/b.fudspec', 'src/missing.fudspec'], options(), fs)).toEqual(['src/b.fudspec']);
  });

  it('formats a .fudspec with formatSpec, and plans nothing for one already formatted', async () => {
    const fs = new MemoryFs({ 'a.fudspec': SPEC_MESSY, 'b.fudspec': SPEC_TIDY });
    const plan = await planFmt(['.'], options(), fs);
    expect(plan.errors).toEqual([]);
    expect(plan.changes).toEqual([{ kind: 'modify', path: 'a.fudspec', contents: SPEC_TIDY, before: SPEC_MESSY }]);
  });

  it('FUD0450 for a .fudspec it cannot format, left alone', async () => {
    const fs = new MemoryFs({ 'broken.fudspec': SPEC_BROKEN, 'a.fudspec': SPEC_MESSY });
    const plan = await planFmt(['.'], options(), fs);
    expect(plan.errors.map((error) => error.code)).toEqual(['FUD0450']);
    expect(plan.changes.map((change) => change.path)).toEqual(['a.fudspec']);

    const { deps: d } = deps(fs);
    expect(await run(['fmt', '--cwd', '/project'], d)).toBe(2);
    expect(fs.at('broken.fudspec')).toBe(SPEC_BROKEN);
  });

  it('writes the formatted .fudspec', async () => {
    const fs = new MemoryFs({ 'src/a.fudspec': SPEC_MESSY });
    const { deps: d } = deps(fs);
    expect(await run(['fmt', 'src/a.fudspec', '--cwd', '/project'], d)).toBe(0);
    expect(fs.at('src/a.fudspec')).toBe(SPEC_TIDY);
  });

  it('--check counts .fud and .fudspec alike', async () => {
    const fs = new MemoryFs({ 'a.fud': MESSY, 'b.fudspec': SPEC_MESSY });
    const { deps: d, capture } = deps(fs);
    expect(await run(['fmt', '--check', '--cwd', '/project'], d)).toBe(1);
    expect(capture.stdout()).toContain('would format  a.fud');
    expect(capture.stdout()).toContain('would format  b.fudspec');
    expect(fs.at('b.fudspec')).toBe(SPEC_MESSY);

    const tidy = new MemoryFs({ 'a.fud': TIDY, 'b.fudspec': SPEC_TIDY });
    expect(await run(['fmt', '--check', '--cwd', '/project'], deps(tidy).deps)).toBe(0);
  });
});
