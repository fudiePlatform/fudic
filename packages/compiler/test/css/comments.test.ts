/** SDD-83 §3.2: the comments of a stretch of CSS, where a `fud-disable` of a stylesheet lives. */

import { describe, expect, it } from 'vitest';
import { cssComments } from '../../src/index.js';

describe('cssComments', () => {
  it('every comment, delimiters included, in order', () => {
    const css = 'a { color: red; } /* one */\nb {\n  /* two\n  lines */ c: d;\n}';
    expect(cssComments(css).map((c) => c.text)).toEqual(['/* one */', '/* two\n  lines */']);
    expect(cssComments(css)[0]!.span).toEqual({ start: 18, end: 27 });
  });

  it('a /* inside a string is not a comment, in either quote, escapes included', () => {
    const css = `a { content: "/* no */"; b: 'x\\'/*'; } /* yes */`;
    expect(cssComments(css).map((c) => c.text)).toEqual(['/* yes */']);
  });

  it('a string that never closes ends at its line', () => {
    expect(cssComments('a { content: "open\n/* yes */').map((c) => c.text)).toEqual(['/* yes */']);
  });

  it('an unclosed comment runs to the end of the stretch', () => {
    expect(cssComments('a {} /* open')).toEqual([{ span: { start: 5, end: 12 }, text: '/* open' }]);
  });

  it('only between from and to: a comment closing past the stretch ends at it', () => {
    const source = '<style>/* a */ x {}</style><p>/* not css */</p>';
    expect(cssComments(source, 7, 19).map((c) => c.text)).toEqual(['/* a */']);
    expect(cssComments('/* runs past */', 0, 6)).toEqual([{ span: { start: 0, end: 6 }, text: '/* run' }]);
  });
});
