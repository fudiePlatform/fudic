import { describe, expect, it } from 'vitest';
import { LeafTable } from '../../src/leaf/index.js';
import { leafOf, reindent, sliceOf } from '../../src/print/context.js';
import { printDoc } from '../../src/doc/index.js';
import { formatWith } from '../../src/format.js';
import { FakeEngine, options } from '../_support.js';

const print = async (source: string, extra: Record<string, unknown> = {}): Promise<string> => {
  const result = await formatWith(new FakeEngine(), source, extra);
  if (!result.ok) throw new Error(`refused: ${JSON.stringify(result.diagnostics)}`);
  return result.text;
};

describe('the leaf fallback', () => {
  const ctx = { source: 'hello world', leaves: new LeafTable(), options: options() };

  it('answers with the source when nobody formatted that span', () => {
    // The collector's failure mode, made explicit: less formatted, never wrong.
    expect(leafOf(ctx, { start: 0, end: 5 })).toBe('hello');
    expect(sliceOf(ctx, { start: 6, end: 11 })).toBe('world');
  });

  it('answers with the formatted text when somebody did', () => {
    ctx.leaves.set(0, 5, 'HELLO');
    expect(leafOf(ctx, { start: 0, end: 5 })).toBe('HELLO');
  });

  it('reindent follows the indentation it is placed in', () => {
    expect(printDoc(reindent('a\nb'), options())).toBe('a\nb');
  });
});

describe('quote: single', () => {
  it('wraps attribute values in single quotes, and swaps when the value holds one', async () => {
    expect(await print('<a title="x">t</a>', { quote: 'single' })).toBe("<a title='x'>t</a>\n");
    expect(await print(`<a title="@(x + 'y')">t</a>`, { quote: 'single' })).toBe(
      `<a title="@(x + 'y')">t</a>\n`,
    );
  });
});

describe('degenerate constructs', () => {
  it('prints an @if whose else body is empty', async () => {
    expect(await print('@if (a) {\n  <p>x</p>\n} else {}')).toBe('@if (a) {\n  <p>x</p>\n} else {}\n');
  });

  it('prints a @switch label a comment is glued to', async () => {
    const out = await print('@switch (t) {@* c *@case 1:\n    <p>a</p>\n}');
    expect(out).toContain('@* c *@ case 1:');
  });
});
