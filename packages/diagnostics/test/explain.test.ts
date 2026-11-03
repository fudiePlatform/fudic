/**
 * Where "Explain FUDnnnn" finds a code's `.md`: in the package's `src/codes/` whether this
 * module runs from `src/` or from `dist/src/`, and in `codes/` beside a bundle.
 */

import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { explain, explanationFile, explanationsDir } from '../src/explain.js';

const CODES = fileURLToPath(new URL('../src/codes/', import.meta.url));
const root = fileURLToPath(new URL('../', import.meta.url));

describe('explanationsDir', () => {
  it('is the package’s src/codes/ when this module runs from src/', () => {
    expect(explanationsDir()).toBe(CODES);
  });

  it('is the same folder when it runs from dist/src/, once built', () => {
    const built = pathToFileURL(join(root, 'dist', 'src', 'explain.js')).href;
    expect(explanationsDir(built)).toBe(CODES);
  });

  it('is codes/ beside the bundle when it runs bundled into the editor’s server', () => {
    const bundle = pathToFileURL(join(root, 'ext', 'dist', 'server.js')).href;
    expect(explanationsDir(bundle)).toBe(join(root, 'ext', 'dist', 'codes', '/'));
  });
});

describe('explanationFile', () => {
  it('names a file that exists, for every explanation the package ships', () => {
    const shipped = readdirSync(CODES).filter((f) => f.endsWith('.md'));
    expect(shipped.length).toBeGreaterThan(200);
    for (const md of shipped) {
      const file = explanationFile(md.slice(0, -3) as `FUD${number}`);
      expect(file).toBe(join(CODES, md));
      expect(existsSync(file)).toBe(true);
    }
  });

  it('looks in the folder it is given', () => {
    expect(explanationFile('FUD0051', '/x/codes')).toBe(join('/x/codes', 'FUD0051.md'));
  });
});

/** SDD-62 criterion 3: a code's `.md`, read as data. */
describe('explain', () => {
  it('splits a live code into title, severity, why and fix, with the texts of its .md', () => {
    expect(explain('FUD0540')).toEqual({
      code: 'FUD0540',
      title: 'Loop without `key (…)`',
      severity: 'error',
      why:
        'Every `@foreach`, `@for` and `@while` declares the identity of its rows, so an update ' +
        'can keep, move or drop each one instead of rebuilding the list.',
      fix: 'add a key after the header: `@foreach (const item of items) key (item.id) { … }`.',
    });
  });

  it('gives a retired code its replacedBy, not a fix, and joins its body lines with a space', () => {
    const e = explain('FUD1000');
    expect(e).toEqual({
      code: 'FUD1000',
      title: 'Chain that cannot be read at compile time',
      severity: 'retired',
      why:
        'It reported a chain of a `@server` function the compiler could not read without running it. ' +
        'The `.fud` no longer carries a server: a chain is declared in a `.fudapi` (`use`, `skip`, ' +
        '`compress`) and read by its parser. The number is not reused.',
      replacedBy: 'the diagnostics of the `.fudapi` parser (FUD1060–FUD1079).',
    });
    expect(e).not.toHaveProperty('fix');
  });

  it('is undefined for a code with no .md', () => {
    expect(explain('FUD9999')).toBeUndefined();
  });

  it('reads every .md the package ships, each with exactly one of fix and replacedBy', () => {
    for (const f of readdirSync(CODES).filter((n) => n.endsWith('.md'))) {
      const e = explain(f.slice(0, -3));
      expect(e, f).toBeDefined();
      expect(e!.code).toBe(f.slice(0, -3));
      expect(e!.why, f).not.toBe('');
      expect(e!.severity === 'retired' ? e!.replacedBy : e!.fix, f).toBeTruthy();
      expect(e!.severity === 'retired' ? 'fix' in e! : 'replacedBy' in e!, f).toBe(false);
    }
  });

  describe('in the folder it is given', () => {
    let dir: string;
    const write = (code: string, text: string): void => writeFileSync(join(dir, `${code}.md`), text);

    beforeAll(() => {
      dir = mkdtempSync(join(tmpdir(), 'fudic-explain-'));
    });
    afterAll(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    it('tolerates CRLF line endings and a trailing newline', () => {
      write('FUD0001', '# FUD0001 — A title\r\n**warning**\r\n\r\nOne.\r\nTwo.\r\n**Fix:** do it.\r\n');
      expect(explain('FUD0001', dir)).toEqual({
        code: 'FUD0001',
        title: 'A title',
        severity: 'warning',
        why: 'One. Two.',
        fix: 'do it.',
      });
    });

    it('reads every severity', () => {
      for (const severity of ['error', 'warning', 'info', 'hint'] as const) {
        write('FUD0002', `# FUD0002 — T\n**${severity}**\n\nWhy.\n**Fix:** f.\n`);
        expect(explain('FUD0002', dir)?.severity).toBe(severity);
      }
    });

    it('gives neither fix nor replacedBy to a body with no closing line', () => {
      write('FUD0003', '# FUD0003 — T\n**info**\n\nWhy only.\n');
      const e = explain('FUD0003', dir);
      expect(e).toEqual({ code: 'FUD0003', title: 'T', severity: 'info', why: 'Why only.' });
      expect(e).not.toHaveProperty('fix');
      expect(e).not.toHaveProperty('replacedBy');
    });

    it('is undefined for a file that does not have the shape', () => {
      write('FUD0004', '# FUD0004 — T\n**error** · SDD-12\n\nWhy.\n**Fix:** f.\n'); // an origin on line 2
      write('FUD0005', 'FUD0005 — T\n**error**\n\nWhy.\n**Fix:** f.\n'); // no heading
      write('FUD0006', '# FUD0006 — T\n**fatal**\n\nWhy.\n**Fix:** f.\n'); // no such severity
      write('FUD0007', '# FUD0007 — T\n**error**\nWhy.\n**Fix:** f.\n'); // no blank line
      write('FUD0008', '');
      for (const code of ['FUD0004', 'FUD0005', 'FUD0006', 'FUD0007', 'FUD0008']) {
        expect(explain(code, dir), code).toBeUndefined();
      }
    });

    it('is undefined for a code with no file in that folder', () => {
      expect(explain('FUD0540', dir)).toBeUndefined();
    });

    it('never turns something that is not a code into a path, and never throws', () => {
      write('FUD0009', '# FUD0009 — T\n**error**\n\nWhy.\n**Fix:** f.\n');
      for (const code of ['', 'fud0009', 'FUD009', 'FUD00090', ' FUD0009', 'FUD0009\n', '../codes/FUD0009', 'FUD0540.md']) {
        expect(explain(code, dir), JSON.stringify(code)).toBeUndefined();
      }
      expect(explain('FUD0009', dir)?.fix).toBe('f.');
    });

    it('is undefined, not a throw, when the path is a folder', () => {
      mkdirSync(join(dir, 'FUD0010.md'));
      expect(() => explain('FUD0010', dir)).not.toThrow();
      expect(explain('FUD0010', dir)).toBeUndefined();
    });
  });
});
