/**
 * SDD-50 criteria 8 and 9: the one place an offset becomes a line. `render` computes line,
 * column and frame from a span and the text it points into; `format` is the terminal text
 * every fudic tool prints.
 */

import { describe, expect, it } from 'vitest';
import { FUD0051, FUD0443, FUD0451, docsUrl, format, render, span } from '../src/index.js';

/** A diagnostic over `needle`, the first time it appears in `source`. */
function over(source: string, needle: string, file?: string) {
  const start = source.indexOf(needle);
  return FUD0051({ span: span(start, start + needle.length), name: 'p', ...(file ? { file } : {}) });
}

describe('render — line and column, 1-based (criterion 8)', () => {
  for (const [eol, name] of [['\n', 'LF'], ['\r\n', 'CRLF'], ['\r', 'CR']] as const) {
    it(`with ${name} line ends`, () => {
      // The stray `</p>` is the second one: on line 3, after two spaces.
      const source = ['<div>', '  <p>x</p>', '  </p>', '</div>'].join(eol);
      const start = source.lastIndexOf('</p>');
      const r = render(FUD0051({ span: span(start, start + 4), name: 'p' }), source);
      expect(r.start).toEqual({ line: 3, column: 3 });
      expect(r.end).toEqual({ line: 3, column: 7 });
      expect(r.frame).toBe('  3    </p>\n       ~~~~');
    });
  }

  it('carries the code, severity, message, docs and file', () => {
    const d = over('<p></q>', '</q>', '/p/a.fud');
    expect(render(d)).toEqual({
      severity: 'error',
      code: 'FUD0051',
      message: d.message,
      docs: docsUrl('FUD0051'),
      file: '/p/a.fud',
    });
  });

  it('says no line, column or frame without the source', () => {
    const r = render(over('<p></q>', '</q>'));
    expect(r).not.toHaveProperty('start');
    expect(r).not.toHaveProperty('end');
    expect(r).not.toHaveProperty('frame');
    expect(r).not.toHaveProperty('file');
  });

  it('says no line, column or frame for a diagnostic with no span', () => {
    const r = render(FUD0451({ line: 'pnpm i', status: 1 }), 'whatever');
    expect(r).not.toHaveProperty('start');
    expect(r).not.toHaveProperty('frame');
  });

  it('underlines a span that runs past its line up to the end of its first line', () => {
    const source = 'ab\n  cdef\nghi';
    const d = FUD0051({ span: span(5, 11), name: 'p' });
    const r = render(d, source);
    expect(r.start).toEqual({ line: 2, column: 3 });
    expect(r.end).toEqual({ line: 3, column: 2 });
    expect(r.frame).toBe('  2    cdef\n       ~~~~');
  });

  it('underlines one column for an empty span, and reads the last line with no line end', () => {
    const source = 'ab\ncd';
    const r = render(FUD0051({ span: span(4, 4), name: 'p' }), source);
    expect(r.start).toEqual({ line: 2, column: 2 });
    expect(r.frame).toBe('  2  cd\n      ~');
  });

  it('pads the underline under a gutter of two digits', () => {
    const source = `${'\n'.repeat(11)}<x>`;
    const r = render(FUD0051({ span: span(11, 14), name: 'p' }), source);
    expect(r.frame).toBe('  12  <x>\n      ~~~');
  });
});

describe('format — the terminal text (criterion 9)', () => {
  const source = '<div>\n  </q>\n</div>';

  it('is `path:line:col - severity CODE: message`, the frame and the link', () => {
    const d = over(source, '</q>', '/p/src/a.fud');
    expect(format(d, { source })).toBe(
      [
        `/p/src/a.fud:2:3 - error FUD0051: ${d.message}`,
        '',
        '  2    </q>',
        '       ~~~~',
        '',
        `  ${docsUrl('FUD0051')}`,
      ].join('\n'),
    );
  });

  it('shows the path relative to the root, in POSIX', () => {
    const d = over(source, '</q>', 'C:\\p\\src\\routes\\a.fud');
    expect(format(d, { root: 'C:\\p', source }).split('\n')[0]).toBe(
      `src/routes/a.fud:2:3 - error FUD0051: ${d.message}`,
    );
    expect(format(over(source, '</q>', '/p/src/a.fud'), { root: '/p/', source })).toMatch(/^src\/a\.fud:2:3 - /u);
  });

  it('leaves a path that is not under the root as it is', () => {
    const d = over(source, '</q>', '/elsewhere/a.fud');
    expect(format(d, { root: '/p', source })).toMatch(/^\/elsewhere\/a\.fud:2:3 - /u);
  });

  it('names the file without a position when it has no source to count lines in', () => {
    const d = FUD0443({ file: 'src/a.fud', target: 'file' });
    expect(format(d)).toBe([`src/a.fud - error FUD0443: ${d.message}`, '', `  ${docsUrl('FUD0443')}`].join('\n'));
  });

  it('starts at the severity when there is no file at all', () => {
    const d = FUD0451({ line: 'pnpm i', status: 1 });
    expect(format(d, { root: '/p' })).toBe([`error FUD0451: ${d.message}`, '', `  ${docsUrl('FUD0451')}`].join('\n'));
  });
});
