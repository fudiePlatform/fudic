import { describe, expect, it } from 'vitest';
import { formatApi, parseApi } from '../src/index.js';
import { CANONICALS, HTTP, USER_FORM, inputs, shape } from './helpers.js';

const lines = (...l: string[]): string => l.join('\n') + '\n';

/** What a source says once its blanks are gone: formatting may never change it. */
const ink = (source: string): string => source.replace(/[ \t\r\n]/gu, '');

describe('formatApi (criterion 7)', () => {
  it('aligns the type and text columns of each block, two spaces past the widest', () => {
    expect(formatApi('type Person\n  id i32\n  name    str\n')).toBe(lines('type Person', '  id    i32', '  name  str'));
    expect(
      formatApi('form f\n  a str\n    required "A."\n    min-length 3 "B."\n  bb str\n    required   "C."\n'),
    ).toBe(
      lines(
        'form f',
        '  a   str',
        '    required      "A."',
        '    min-length 3  "B."',
        '  bb  str',
        '    required  "C."',
      ),
    );
  });

  it('the `= ""` of a field is no text column', () => {
    expect(formatApi('form f\n  name str = ""\n  alias  str = "x"\n')).toBe(lines('form f', '  name   str = ""', '  alias  str = "x"'));
  });

  it('puts a continuation line two spaces past the first two words of its line', () => {
    expect(formatApi(USER_FORM).split('\n').slice(-3)).toEqual([
      '    require key-has-name empty name or not acceso.clave contains name',
      '                          "La contraseña no puede contener tu nombre."',
      '',
    ]);
  });

  it('a continuation line keeps its trailing comment', () => {
    expect(formatApi('form f\n  a str\n  summary\n    require x  a\n          "T."   # note\n')).toBe(
      lines('form f', '  a  str', '  summary', '    require x a', '               "T." # note'),
    );
  });

  it('one blank line between declarations; none inside one, nor at the ends', () => {
    expect(formatApi('\n\npaths\n\n\n\nlayout\nchain\n\n  use log\n\n')).toBe(lines('paths', '', 'layout', '', 'chain', '  use log'));
    expect(formatApi('')).toBe('');
    expect(formatApi('\n\n')).toBe('');
  });

  it('re-indents by level, two spaces each, a bad indentation at the level it is read', () => {
    expect(formatApi('chain\n   use error-pages\n        routes 403 /x\n')).toBe(
      lines('chain', '  use error-pages', '    routes  403 /x'),
    );
    expect(formatApi('type A\n\t\tx str\n')).toBe(lines('type A', '  x  str'));
  });

  it('a `pattern` line indented by one is read like the parser reads it, and loses no text', () => {
    // The parser reads the rest of a `pattern` line as one token only at indentation 0.
    const once = formatApi(' pattern p "x"\n');
    expect(ink(once)).toBe(ink(' pattern p "x"\n'));
    expect(formatApi(once)).toBe(once);
  });

  it('keeps comments, at the level of the line they precede', () => {
    expect(formatApi('# doc\ntype A\n      # field doc\n  x  str   # trailing\n# end\n')).toBe(
      lines('# doc', 'type A', '  # field doc', '  x  str # trailing', '  # end'),
    );
  });

  it('a comment set apart from what follows stays apart, so it is not its documentation', () => {
    expect(formatApi('type A\n  # loose\n\n  x  str\n')).toBe(lines('type A', '  # loose', '', '  x  str'));
    expect(formatApi('# loose\n\ntype A\n  x  str\n')).toBe(lines('# loose', '', 'type A', '  x  str'));
  });

  it('a comment glued to a declaration goes with it after the blank line', () => {
    expect(formatApi('paths\n# about layout\nlayout\n')).toBe(lines('paths', '', '# about layout', 'layout'));
  });

  it('a file of only comments', () => {
    expect(formatApi('  # a\n# b')).toBe(lines('# a', '# b'));
  });

  it('keeps consecutive patterns together, their regexes lined up', () => {
    expect(formatApi('pattern email-loose [^@]+@.+\n\npattern web-url https?://.+\ntype A\n  x str\n')).toBe(
      lines('pattern email-loose  [^@]+@.+', 'pattern web-url      https?://.+', '', 'type A', '  x  str'),
    );
  });

  it('a documented pattern after another is set apart', () => {
    expect(formatApi('pattern a  x\n# The b.\npattern b  y\n')).toBe(lines('pattern a  x', '', '# The b.', 'pattern b  y'));
  });

  it('keeps the line ending of the source', () => {
    expect(formatApi('paths\r\nlayout')).toBe('paths\r\n\r\nlayout\r\n');
    expect(formatApi('paths\rlayout')).toBe('paths\r\rlayout\r');
  });

  it('leaves a file with an unclosed quote as it is', () => {
    const source = 'messages\n  required    "unclosed\n  min "x"';
    expect(formatApi(source)).toBe(source);
  });

  for (const [name, source] of Object.entries(CANONICALS)) {
    it(`${name}: idempotent, only blanks moved, the same tree`, () => {
      const once = formatApi(source);
      expect(formatApi(once)).toBe(once);
      expect(ink(once)).toBe(ink(source));
      expect(parseApi(once).diagnostics).toEqual([]);
      expect(shape(parseApi(once).value.declarations)).toEqual(shape(parseApi(source).value.declarations));
    });
  }

  it('the chain of §3.5 is already formatted', () => {
    expect(formatApi(HTTP)).toBe(HTTP);
  });

  it('over the sweep: idempotent and only blanks moved', () => {
    for (const source of inputs()) {
      const once = formatApi(source);
      if (once === source) continue;
      expect(formatApi(once), JSON.stringify(source)).toBe(once);
      expect(ink(once), JSON.stringify(source)).toBe(ink(source));
    }
  });
});
