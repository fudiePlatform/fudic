/**
 * SDD-35 §4.3: a fudic `info` or `hint` is an editor's grey hint, not a problem of the build.
 *
 * No rule the check runs reports one today — the only two are the formatter's (`FUD0480`,
 * `FUD0481`) — so the rules are replaced here by ones that do, to pin the filter down before
 * the first such rule exists.
 */

import { describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FUD0480 } from '@fudic/diagnostics';
import { createProjectChecker, toPosix } from '../src/index.js';

vi.mock('../src/fudic-diagnostics.js', async (original) => {
  const actual = await original<typeof import('../src/fudic-diagnostics.js')>();
  return {
    ...actual,
    fudicDiagnostics: () => [
      FUD0480({ span: { start: 0, end: 1 } }),
      { ...FUD0480({ span: { start: 1, end: 2 } }), severity: 'hint' as const },
      { ...FUD0480({ span: { start: 2, end: 3 } }), severity: 'warning' as const },
    ],
  };
});

describe('fudic hints', () => {
  it('are not reported; a warning is', () => {
    const root = toPosix(mkdtempSync(join(tmpdir(), 'fudic-hints-')));
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'tsconfig.json'), JSON.stringify({ include: ['**/*.fud'] }));
    writeFileSync(join(root, 'src', 'app-x.fud'), '<app-x>\n  <template shadowrootmode="open"></template>\n</app-x>\n');

    const report = createProjectChecker({ root }).check();

    expect(report.problems.map((problem) => `${problem.code} ${problem.severity}`)).toEqual(['FUD0480 warning']);
  });
});
