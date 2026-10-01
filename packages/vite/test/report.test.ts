/**
 * The build's terminal text (SDD-50 §4.5): `@fudic/diagnostics`' `format`, given the path
 * relative to the project and the text of the file, read here, for line, column and frame.
 */

import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FUD0051, FUD0399, span } from '@fudic/diagnostics';
import { reportText } from '../src/report.js';

const root = mkdtempSync(join(tmpdir(), 'fudic-report-'));
mkdirSync(join(root, 'src'), { recursive: true });
const file = join(root, 'src', 'a.fud');
writeFileSync(file, '<div>\n  </q>\n</div>\n');
const stray = FUD0051({ span: span(8, 12), name: 'q' });

describe('reportText', () => {
  it('names the module being compiled, relative to the root, with line, column and frame', () => {
    const text = reportText(stray, root, file);
    expect(text.split('\n')[0]).toBe(`src/a.fud:2:3 - error FUD0051: ${stray.message}`);
    expect(text).toContain('  2    </q>\n       ~~~~');
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
