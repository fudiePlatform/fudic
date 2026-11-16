/**
 * SDD-83 §3.3, §3.10: what the build reports goes through the policy of the project each file
 * belongs to and the file's own comments, as the check and the editor do; and when it compiles
 * an app, a library's warnings stay with whoever develops it, its errors do not (criterion 13).
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FUD0051, FUD1027, FUD1380, type FudDiagnostic } from '@fudic/diagnostics';
import { BuildReporter, type PluginLog, type ReportContext } from '../src/report.js';

/** A workspace on disk: an app at `app/` and a library at `libs/ui/`. */
function workspace(files: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(join(tmpdir(), 'fudic-report-policy-'));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

/** What reaching Vite looks like: the warnings, and the one failure with every error. */
function reported(reporter: BuildReporter, diagnostics: readonly FudDiagnostic[], module?: string) {
  const warnings: string[] = [];
  let failure: string | undefined;
  const context: ReportContext = {
    warn: (log: PluginLog) => void warnings.push(log.message),
    error: (log: PluginLog) => {
      failure = log.message;
      throw new Error('stop');
    },
  };
  try {
    reporter.report(context, diagnostics, module);
  } catch {
    // The failure is what is asserted.
  }
  return { warnings, failure };
}

const COMPONENT = '<x-a>\n  <template shadowrootmode="open">\n    <p></p>\n  </template>\n</x-a>\n';
const loopAt = (start: number) => FUD1380({ span: { start, end: start + 3 }, event: 'click' });

describe('the build reports under the policy and the comments', () => {
  it("the app's policy: off, and raised to an error with the message saying so", () => {
    const root = workspace({
      'app/fudic.json': '{"diagnostics":{"FUD1380":"error","FUD1027":"off"}}',
      'app/src/x-a.fud': COMPONENT,
    });
    const reporter = new BuildReporter(join(root, 'app'), { remember: false });
    const { warnings, failure } = reported(reporter, [loopAt(36), FUD1027()], join(root, 'app/src/x-a.fud'));
    expect(warnings).toEqual([]);
    expect(failure).toContain('(warning by default; error in this project)');
  });

  it("the file's own comment silences its warning", () => {
    const root = workspace({ 'app/fudic.json': '{}', 'app/src/x-a.fud': `@* fud-disable FUD1380: on purpose *@\n${COMPONENT}` });
    const reporter = new BuildReporter(join(root, 'app'), { remember: false });
    expect(reported(reporter, [loopAt(70)], join(root, 'app/src/x-a.fud')).warnings).toEqual([]);
  });

  it("a library's warning is not said in the app; its error is (criterion 13)", () => {
    const root = workspace({
      'app/fudic.json': '{}',
      'libs/ui/fudic.json': '{"kind":"lib"}',
      'libs/ui/x-a.fud': COMPONENT,
    });
    const reporter = new BuildReporter(join(root, 'app'), { remember: false });
    const lib = join(root, 'libs/ui/x-a.fud');
    const { warnings, failure } = reported(reporter, [loopAt(36), FUD0051({ span: { start: 0, end: 4 }, name: 'q' })], lib);
    expect(warnings).toEqual([]);
    expect(failure).toContain('FUD0051');
  });

  it('a file of another project that is an app, and a file of no project, are said', () => {
    const root = workspace({
      'app/fudic.json': '{}',
      'other/fudic.json': '{"kind":"app"}',
      'other/x-a.fud': COMPONENT,
      'loose/x-a.fud': COMPONENT,
    });
    const reporter = new BuildReporter(join(root, 'app'), { remember: false });
    expect(reported(reporter, [loopAt(36)], join(root, 'other/x-a.fud')).warnings).toHaveLength(1);
    expect(reported(reporter, [loopAt(36)], join(root, 'loose/x-a.fud')).warnings).toHaveLength(1);
  });

  it('a batch of errors only passes as it is', () => {
    const root = workspace({ 'app/fudic.json': '{"diagnostics":{"warnings":"off"}}', 'app/src/x-a.fud': COMPONENT });
    const reporter = new BuildReporter(join(root, 'app'), { remember: false });
    const { failure } = reported(reporter, [FUD0051({ span: { start: 0, end: 4 }, name: 'q' })], join(root, 'app/src/x-a.fud'));
    expect(failure).toContain('FUD0051');
  });

  it('a group of errors of one file is not read for comments, the warnings of another are', () => {
    const root = workspace({
      'app/fudic.json': '{}',
      'app/src/x-a.fud': COMPONENT,
      'app/src/x-b.fud': `@* fud-disable FUD1380: r *@\n${COMPONENT}`,
    });
    const reporter = new BuildReporter(join(root, 'app'), { remember: false });
    const error = { ...FUD0051({ span: { start: 0, end: 4 }, name: 'q' }), file: join(root, 'app/src/x-a.fud') };
    const warning = { ...loopAt(60), file: join(root, 'app/src/x-b.fud') };
    const { warnings, failure } = reported(reporter, [error, warning]);
    expect(warnings).toEqual([]);
    expect(failure).toContain('FUD0051');
  });
});
