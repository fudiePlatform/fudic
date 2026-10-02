import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formatSpec, parseSpec, specSkeleton } from '../src/index.js';
import { CANONICAL, FIXTURES, inputs, shape } from './helpers.js';

const EXAMPLE = readFileSync(new URL('../../../examples/basic/src/components/app-card.fudspec', import.meta.url), 'utf8');

/** The formatted text of `lines` joined with `\n`; the formatter must accept it. */
function format(...lines: readonly string[]): string {
  const result = formatSpec(lines.join('\n'));
  expect(result.ok).toBe(true);
  return result.text;
}

const text = (...lines: readonly string[]): string => `${lines.join('\n')}\n`;

/** What the parser reads, without offsets: the tree and the text of every comment. */
function read(source: string): unknown {
  const { value } = parseSpec(source);
  return { tree: shape(value), comments: value.comments.map((c) => source.slice(c.start, c.end).trimEnd()) };
}

describe('formatSpec — the example (criterion 19)', () => {
  const formatted = formatSpec(EXAMPLE);

  it('formats app-card.fudspec by the rules', () => {
    expect(formatted).toEqual({
      ok: true,
      text: text(
        'component app-card',
        '',
        '# A card never collapses, whatever its title.',
        'criterion altura-minima',
        '  given',
        '    props minima',
        '    route /blog',
        '  then',
        '    min-height app-card 44',
        '',
        'criterion titulo-largo-visible',
        '  given',
        '    props titulo-largo',
        '  then',
        '    visible app-card',
        '    text app-card "A title long enough"',
        '',
        'criterion destacada-al-cambiar-variante',
        '  given',
        '    props destacada',
        '  when',
        '    set-attribute app-card variant "highlight"',
        '    click role:link/"Featured"',
        '  then',
        '    visible role:link/"Featured"',
      ),
    });
  });

  it('leaves the tree as it was, spans aside', () => {
    expect(read(formatted.text)).toEqual(read(EXAMPLE));
  });
});

describe('formatSpec — one input per rule (criterion 20)', () => {
  it('1. puts component and criterion at 0, blocks at 2 and terms at 4', () => {
    expect(format(' component x', '   criterion a', ' given', '      route /', '   then', '  \tvisible x')).toBe(
      text('component x', '', 'criterion a', '  given', '    route /', '  then', '    visible x'),
    );
  });

  it('1. leaves a line already at 0, 2 or 4 where it is, even at the wrong level', () => {
    expect(format('  component x', 'criterion a', '  then', '  min-height x 1')).toBe(
      text('  component x', '', 'criterion a', '  then', '  min-height x 1'),
    );
  });

  it('2. leaves one space between tokens and the inside of a string untouched', () => {
    expect(format('component x', 'criterion a', '  then', '    text    x   "a   b"', '    visible  role:button/"Say   hi"')).toBe(
      text('component x', '', 'criterion a', '  then', '    text x "a   b"', '    visible role:button/"Say   hi"'),
    );
  });

  it('3. puts a trailing comment one space after the last token', () => {
    expect(format('component x     # the card   ', 'criterion a', '  then\t# then', '    visible x#y   #  spaced  ')).toBe(
      text('component x # the card', '', 'criterion a', '  then # then', '    visible x#y #  spaced'),
    );
  });

  it('3. indents a comment on its own line like the line after it', () => {
    expect(format('component x', 'criterion a', '# a block', '  then', '      # a term', '    visible x')).toBe(
      text('component x', '', 'criterion a', '  # a block', '  then', '    # a term', '    visible x'),
    );
  });

  it('3. at the end of the file, like the line before it; with no line at all, at 0', () => {
    expect(format('component x', 'criterion a', '  then', '    visible x', '# last', '  # really last')).toBe(
      text('component x', '', 'criterion a', '  then', '    visible x', '    # last', '    # really last'),
    );
    expect(format('   # only', '# comments')).toBe(text('# only', '# comments'));
  });

  it('4. leaves no blank at the end of a line, and drops blank-only lines', () => {
    expect(format('component x   ', '   ', 'criterion a  ', '  then \t', '    visible x ')).toBe(
      text('component x', '', 'criterion a', '  then', '    visible x'),
    );
  });

  it('5. one blank line after component and between criteria, none inside a criterion', () => {
    const source = ['component x', 'criterion a', '', '  then', '', '', '    visible x', 'criterion b', '', '', '', 'criterion c'];
    expect(format(...source)).toBe(
      text('component x', '', 'criterion a', '  then', '    visible x', '', 'criterion b', '', 'criterion c'),
    );
  });

  it('5. glues the comments between criteria to the criterion after them', () => {
    const source = ['component x', '# about a', '', 'criterion a', '  then', '    visible x', '', '# about b', '# more', '', '', 'criterion b'];
    expect(format(...source)).toBe(
      text('component x', '', '# about a', 'criterion a', '  then', '    visible x', '', '# about b', '# more', 'criterion b'),
    );
  });

  it('5. starts a group only at a component or criterion line at level 0', () => {
    // `crit` is no opener, and a `criterion` read at level 4 is not one either.
    expect(format('component x', 'crit a', '  then', '    criterion b')).toBe(
      text('component x', 'crit a', '  then', '    criterion b'),
    );
  });

  it('6. keeps the first line ending of the file, `\\r\\n` or `\\r`', () => {
    expect(formatSpec('component x\r\ncriterion a\n  then\r    visible x\r\n')).toEqual({
      ok: true,
      text: 'component x\r\n\r\ncriterion a\r\n  then\r\n    visible x\r\n',
    });
    expect(formatSpec('component x\rcriterion a\r\n  then').text).toBe('component x\r\rcriterion a\r  then\r');
  });

  it('6. ends with exactly one line ending; `\\n` when the file has none', () => {
    expect(formatSpec('component x').text).toBe('component x\n');
    expect(formatSpec('component x\n\n\n\n').text).toBe('component x\n');
    expect(formatSpec('component x\r\n\r\n\r\n').text).toBe('component x\r\n');
  });

  it('6. formats an empty or blank file to nothing', () => {
    expect(formatSpec('')).toEqual({ ok: true, text: '' });
    expect(formatSpec('  \n\t\n\r\n')).toEqual({ ok: true, text: '' });
  });

  it('7. changes no name, no order and no quote', () => {
    expect(format('component App-Card', 'criterion B', '  then', '    minHeight  "x"  44', 'criterion A', '  given', '  then')).toBe(
      text('component App-Card', '', 'criterion B', '  then', '    minHeight "x" 44', '', 'criterion A', '  given', '  then'),
    );
  });

  it('keeps a line the parser cannot place and text after a name', () => {
    expect(format('stray words here', 'component x extra', 'criterion a b', '  then', '    visible x')).toBe(
      text('stray words here', '', 'component x extra', '', 'criterion a b', '  then', '    visible x'),
    );
  });
});

describe('formatSpec — idempotence and the tree (criterion 21)', () => {
  const sources = [EXAMPLE, CANONICAL, ...FIXTURES, specSkeleton('app-card', true), specSkeleton('app-card', false)];

  it.each(sources.map((s, i) => [i, s] as const))('formatting fixture %i twice changes nothing', (_, source) => {
    const once = formatSpec(source);
    expect(once.ok).toBe(true);
    expect(formatSpec(once.text)).toEqual(once);
  });

  it('over every generated input it can format: idempotent, and the tree is the same', () => {
    let formatted = 0;
    for (const source of inputs()) {
      const once = formatSpec(source);
      if (!once.ok) continue;
      formatted++;
      if (formatSpec(once.text).text !== once.text) throw new Error(`not idempotent: ${JSON.stringify(source)}`);
      expect(read(once.text), JSON.stringify(source)).toEqual(read(source));
    }
    expect(formatted).toBeGreaterThan(500);
  });
});

describe('formatSpec — what it will not format (criterion 22)', () => {
  it('refuses an unclosed quote and returns the text as it was', () => {
    const source = 'component x\ncriterion a\n  then\n      text x "unclosed   \n';
    expect(parseSpec(source).diagnostics.map((d) => d.code)).toContain('FUD0920');
    expect(formatSpec(source)).toEqual({ ok: false, text: source });
  });

  it('formats a wrong indentation: a tab and three spaces', () => {
    const source = 'component x\ncriterion a\n\tthen\n   visible x\n';
    expect(parseSpec(source).diagnostics.map((d) => d.code)).toEqual(['FUD0921', 'FUD0921']);
    const result = formatSpec(source);
    expect(result).toEqual({ ok: true, text: text('component x', '', 'criterion a', '  then', '    visible x') });
    expect(parseSpec(result.text).diagnostics).toEqual([]);
  });
});
