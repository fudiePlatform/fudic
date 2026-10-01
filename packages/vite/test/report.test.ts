/**
 * The build's terminal text (SDD-50 §4.5) and how the build tells a diagnostic (SDD-35 §4.4).
 *
 * `reportText` is `@fudic/diagnostics`' `format`, given the path relative to the project and
 * the text of the file, read here, for line, column and frame. `pluginLog` is the same
 * diagnostic as Vite takes it — `loc` and `frame` where the terminal and the overlay put them.
 * `BuildReporter` is the one place every diagnostic of a build goes through: warnings one by
 * one, every error of a batch in ONE failure positioned at the first, and nothing the
 * typecheck already said said again (except in dev, where a file is compiled on every save).
 */

import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { FUD0051, FUD0399, span, type FudDiagnostic } from '@fudic/diagnostics';
import { toPosix, type CheckReport } from '@fudic/typecheck';
import { BuildReporter, pluginLog, reportText, type PluginLog, type ReportContext } from '../src/report.js';

const root = mkdtempSync(join(tmpdir(), 'fudic-report-'));
mkdirSync(join(root, 'src'), { recursive: true });
const file = join(root, 'src', 'a.fud');
writeFileSync(file, '<div>\n  </q>\n</div>\n');
const stray = FUD0051({ span: span(8, 12), name: 'q' });

describe('reportText', () => {
  it('names the module being compiled, relative to the root, with line, column and frame', () => {
    const text = reportText(stray, root, file);
    expect(text.split('\n')[0]).toBe(`src/a.fud:2:3 - error FUD0051: ${stray.message}`);
    // `─` and not `~` (SDD-35 §4.4): a word of tildes is a Ctrl+Click link to the home folder.
    expect(text).toContain('  2    </q>\n       ────');
  });

  it('reads a file the author named relative to the root, as fudic.json names its sheets', () => {
    const text = reportText({ ...stray, file: 'src/a.fud' }, root);
    expect(text.split('\n')[0]).toBe(`src/a.fud:2:3 - error FUD0051: ${stray.message}`);
  });

  it('still names the file when it cannot be read, without a line it does not have', () => {
    const text = reportText(stray, root, join(root, 'src', 'gone.fud'));
    expect(text.split('\n')[0]).toBe(`src/gone.fud - error FUD0051: ${stray.message}`);
  });

  it('says a build diagnostic with no place as it is', () => {
    const d = FUD0399({ pattern: '/blog' });
    expect(reportText(d, root, file).split('\n')[0]).toBe(`warning FUD0399: ${d.message}`);
  });
});

describe('pluginLog — a diagnostic as Vite takes it', () => {
  it('a located diagnostic carries id, a 1-based loc and the frame, not repeated in the message', () => {
    const log = pluginLog(stray, root, file);
    expect(log.id).toBe(file);
    expect(log.loc).toEqual({ file, line: 2, column: 3 });
    expect(log.frame).toBe('  2    </q>\n       ────');
    expect(log.message.split('\n')[0]).toBe(`src/a.fud:2:3 - error FUD0051: ${stray.message}`);
    expect(log.message).toContain('#FUD0051');
    expect(log.message).not.toContain('────');
  });

  it('a diagnostic with no place is its formatted text alone', () => {
    const d = FUD0399({ pattern: '/blog' });
    const log = pluginLog(d, root);
    expect(log).toEqual({ message: reportText(d, root) });
  });

  it('a file it cannot read gives the head line without a loc it does not know', () => {
    const gone = join(root, 'src', 'gone.fud');
    const log = pluginLog(stray, root, gone);
    expect(log.loc).toBeUndefined();
    expect(log.frame).toBeUndefined();
    expect(log.message.split('\n')[0]).toBe(`src/gone.fud - error FUD0051: ${stray.message}`);
  });
});

/** A plugin context that records what it was told; `error` throws, as Rollup's does. */
function context(): ReportContext & { warnings: PluginLog[]; errors: PluginLog[] } {
  const warnings: PluginLog[] = [];
  const errors: PluginLog[] = [];
  return {
    warnings,
    errors,
    warn: vi.fn((log: PluginLog) => {
      warnings.push(log);
    }),
    error: vi.fn((log: PluginLog): never => {
      errors.push(log);
      throw new Error(log.message);
    }),
  };
}

const at = (start: number, end: number, extra: Partial<FudDiagnostic> = {}): FudDiagnostic =>
  ({ ...FUD0051({ span: span(start, end), name: 'q' }), ...extra }) as FudDiagnostic;

/** A check report that said `stray` on `file`, as the typecheck would. */
const checked = (): CheckReport => ({
  problems: [
    { file: toPosix(file), span: stray.span!, severity: 'error', code: 'FUD0051', message: stray.message },
  ],
  project: [],
  inputs: [],
});

describe('BuildReporter — every diagnostic of a batch, positioned, once', () => {
  it('says nothing for an empty batch', () => {
    const ctx = context();
    new BuildReporter(root).report(ctx, []);
    expect(ctx.warn).not.toHaveBeenCalled();
    expect(ctx.error).not.toHaveBeenCalled();
  });

  it('warns every warning, one by one, and does not fail', () => {
    const ctx = context();
    new BuildReporter(root).report(
      ctx,
      [at(8, 12, { severity: 'warning' }), at(0, 4, { severity: 'warning' })],
      file,
    );
    expect(ctx.warnings).toHaveLength(2);
    expect(ctx.warnings[0]!.loc).toEqual({ file, line: 2, column: 3 });
    expect(ctx.warnings[1]!.loc).toEqual({ file, line: 1, column: 1 });
    expect(ctx.error).not.toHaveBeenCalled();
  });

  it('fails ONCE with every error, positioned at the first, after the warnings', () => {
    const ctx = context();
    expect(() =>
      new BuildReporter(root).report(
        ctx,
        [at(8, 12), at(0, 4, { severity: 'warning' }), at(13, 19)],
        file,
      ),
    ).toThrow();
    expect(ctx.warnings).toHaveLength(1);
    expect(ctx.errors).toHaveLength(1);
    const [log] = ctx.errors;
    expect(log!.loc).toEqual({ file, line: 2, column: 3 });
    expect(log!.frame).toBe('  2    </q>\n       ────');
    // Both errors in the message, the first one's head line first.
    expect(log!.message).toMatch(/^src\/a\.fud:2:3 - error FUD0051/u);
    expect(log!.message).toContain('src/a.fud:3:1 - error FUD0051');
  });

  it('a diagnostic that names its own file is reported there, not in the module', () => {
    const other = join(root, 'src', 'b.fud');
    writeFileSync(other, '<p>\n</p>\n');
    const ctx = context();
    new BuildReporter(root).report(ctx, [at(0, 3, { severity: 'warning', file: other })], file);
    expect(ctx.warnings[0]!.id).toBe(other);
  });

  it('`module` names the file of a diagnostic that has a span and no file', () => {
    const ctx = context();
    new BuildReporter(root).report(ctx, [at(8, 12, { severity: 'warning' })], file);
    expect(ctx.warnings[0]!.id).toBe(file);
    // Without a module, the same diagnostic has no place to point at.
    const bare = context();
    new BuildReporter(root).report(bare, [at(8, 12, { severity: 'warning' })]);
    expect(bare.warnings[0]!.id).toBeUndefined();
    expect(bare.warnings[0]!.loc).toBeUndefined();
  });

  it('a diagnostic without file or span is said, and said every time', () => {
    const d = FUD0399({ pattern: '/blog' });
    const reporter = new BuildReporter(root);
    const ctx = context();
    reporter.report(ctx, [d], file);
    reporter.report(ctx, [d], file);
    expect(ctx.warnings).toEqual([{ message: reportText(d, root) }, { message: reportText(d, root) }]);
  });

  it('info and hint are not the build’s to say', () => {
    const ctx = context();
    new BuildReporter(root).report(ctx, [at(8, 12, { severity: 'info' }), at(0, 4, { severity: 'hint' })], file);
    expect(ctx.warn).not.toHaveBeenCalled();
    expect(ctx.error).not.toHaveBeenCalled();
  });

  it('what the typecheck said is not said again by the emit', () => {
    const reporter = new BuildReporter(root);
    reporter.rememberCheck(checked());
    const ctx = context();
    reporter.report(ctx, [stray], file);
    expect(ctx.error).not.toHaveBeenCalled();
    // The same code at another span is another diagnostic, and fails.
    expect(() => reporter.report(ctx, [at(13, 19)], file)).toThrow();
  });

  it('a pass that compiles the same file again does not repeat it', () => {
    const reporter = new BuildReporter(root);
    const first = context();
    reporter.report(first, [at(8, 12, { severity: 'warning' })], file);
    const second = context();
    // The relative and the absolute spelling of one file are one file.
    reporter.report(second, [at(8, 12, { severity: 'warning', file: 'src/a.fud' })]);
    expect(first.warnings).toHaveLength(1);
    expect(second.warn).not.toHaveBeenCalled();
  });

  it('dev (`remember: false`) says it on every save, and does not take the check as said', () => {
    const reporter = new BuildReporter(root, { remember: false });
    reporter.rememberCheck(checked());
    const ctx = context();
    expect(() => reporter.report(ctx, [stray], file)).toThrow();
    expect(() => reporter.report(ctx, [stray], file)).toThrow();
    expect(ctx.errors).toHaveLength(2);
  });
});
