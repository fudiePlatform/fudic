import { describe, expect, it } from 'vitest';
import { formatWith } from '../../src/format.js';
import { FakeEngine } from '../_support.js';

/**
 * Format with an engine that hands every fragment back untouched.
 *
 * These tests are about the printer, and a real JS formatter in the middle would make every
 * expectation depend on somebody else's line-breaking. The leaves have their own suite.
 */
async function print(source: string, printWidth = 100): Promise<string> {
  const result = await formatWith(new FakeEngine(), source, { printWidth });
  if (!result.ok) throw new Error(`refused: ${JSON.stringify(result.diagnostics)}`);
  return result.text;
}

describe('elements', () => {
  it('prints a tag with no attributes as it stands', async () => {
    expect(await print('<div>x</div>')).toBe('<div>x</div>\n');
  });

  it('keeps a void element and a self-closing one in their own shape', async () => {
    expect(await print('<meta charset="utf-8">')).toBe('<meta charset="utf-8">\n');
    expect(await print('<app-x/>')).toBe('<app-x />\n');
  });

  it('breaks the attributes one per line, with the > glued to the last', async () => {
    const source = '<span class="badge" data-one="1" data-two="2">x</span>';
    expect(await print(source, 20)).toBe(
      '<span\n  class="badge"\n  data-one="1"\n  data-two="2">x</span>\n',
    );
  });

  it('puts the > on its own line when the element has no children', async () => {
    const source = '<span class="badge" data-one="1" data-two="2"></span>';
    expect(await print(source, 20)).toBe(
      '<span\n  class="badge"\n  data-one="1"\n  data-two="2"\n></span>\n',
    );
  });

  it('keeps an attribute the author already put on its own line there', async () => {
    // It fits in a hundred columns. A formatter that only asked "does it fit" would join it
    // back up on every save — this is acceptance criterion 10.
    const source = '<span\n  class="badge"\n  data-one="1">x</span>';
    expect(await print(source)).toBe(source + '\n');
  });
});

describe('attributes', () => {
  it('leaves a valueless attribute exactly as written', async () => {
    // `hidden` and `hidden=""` are the same thing (decision 44) and the AST cannot tell
    // them apart: rebuilding one would silently rewrite the other.
    expect(await print('<input hidden>')).toBe('<input hidden>\n');
    expect(await print('<input hidden="">')).toBe('<input hidden="">\n');
  });

  it('quotes with the preferred quote, and with the other when the value holds it', async () => {
    expect(await print(`<a title="@(x + 'y')">t</a>`)).toBe(`<a title="@(x + 'y')">t</a>\n`);
    // A value that already holds the preferred quote takes the other one: an attribute in
    // this subset cannot escape its own delimiter, so swapping is the only way to spell it.
    expect(await print(`<a title='@(x + "y")'>t</a>`)).toBe(`<a title='@(x + "y")'>t</a>\n`);
  });

  it('prints an interpolated value, explicit or implicit', async () => {
    expect(await print('<a href="@url">t</a>')).toBe('<a href="@url">t</a>\n');
    expect(await print('<a href="/p/@id/x">t</a>')).toBe('<a href="/p/@id/x">t</a>\n');
  });

  it('prints a bus: binding whose name is an expression', async () => {
    expect(await print('<a bus:(k)="@h">t</a>')).toBe('<a bus:(k)="@h">t</a>\n');
  });
});

describe('opaque regions', () => {
  it('copies script, pre and textarea byte for byte, indentation included', async () => {
    const source = '<div>\n  <pre>\n      keep\n   this\n  </pre>\n</div>';
    expect(await print(source)).toBe(source + '\n');
  });

  it('does not reindent them when the container around them moves', async () => {
    const inner = '<script>\nconst a = 1;\n</script>';
    const flat = await print(inner);
    const nested = await print(`<div>\n  <section>\n    ${inner}\n  </section>\n</div>`);
    expect(flat).toContain('\nconst a = 1;\n');
    expect(nested).toContain('\nconst a = 1;\n');
  });

  it('still formats their start tag', async () => {
    expect(await print('<pre class="a">x</pre>')).toBe('<pre class="a">x</pre>\n');
  });
});

describe('content', () => {
  it('keeps a text node with no run around it glued to what follows', async () => {
    // Acceptance criterion 9: there is no run to rewrite, so no break can appear.
    const source = '<app-badge tone="x">@data.tag</app-badge>';
    expect(await print(source, 10)).toBe(source + '\n');
  });

  it('wraps a long run of words inside a block, and packs them to the margin', async () => {
    // The runs BETWEEN the words are what give way. There is none after `<p>`, so the first
    // word stays where the author put it, and none before `</p>` either.
    expect(await print('<p>one two three four five</p>', 12)).toBe(
      '<p>one two\n  three four\n  five</p>\n',
    );
    expect(await print('<p>\n  one two three four five\n</p>', 12)).toBe(
      '<p>\n  one two\n  three four\n  five\n</p>\n',
    );
  });

  it('never introduces a break inside inline content', async () => {
    // §4.5 asks for a long line rather than a reflowed one.
    expect(await print('<span>one two three four five</span>', 12)).toBe(
      '<span>one two three four five</span>\n',
    );
  });

  it('collapses a stack of blank lines to one and drops them at the edges', async () => {
    expect(await print('<div>\n\n\n  <p>a</p>\n\n\n\n  <p>b</p>\n\n\n</div>')).toBe(
      '<div>\n  <p>a</p>\n\n  <p>b</p>\n</div>\n',
    );
  });

  it('prints comments, the doctype, @@ and a Razor comment verbatim', async () => {
    const source = '<!DOCTYPE html>\n<!-- keep -->\n@* note *@\na@@b';
    expect(await print(source)).toBe(source + '\n');
  });

  it('ends the file with exactly one newline, whatever it came in with', async () => {
    expect(await print('<p>a</p>')).toBe('<p>a</p>\n');
    expect(await print('<p>a</p>\n\n\n')).toBe('<p>a</p>\n');
    expect(await print('\n\n<p>a</p>')).toBe('<p>a</p>\n');
  });
});
