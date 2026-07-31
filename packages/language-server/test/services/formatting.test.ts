import { describe, expect, it } from 'vitest';
import { formattedText, optionsFrom } from '../../src/services/formatting.js';

const EDITOR = { tabSize: 2, insertSpaces: true } as const;

/** A component laid out by hand, badly: every construct of §4 is one edit away from canonical. */
const MESSY = [
  '<app-badge>',
  '<template shadowrootmode="open">',
  '<p>x</p>',
  '</template>',
  '</app-badge>',
  '',
].join('\n');

describe('optionsFrom', () => {
  it('takes the editor at its word about indentation', () => {
    expect(optionsFrom(EDITOR)).toEqual({ tabWidth: 2, useTabs: false, endOfLine: 'auto' });
    expect(optionsFrom({ tabSize: 4, insertSpaces: false })).toEqual({
      tabWidth: 4,
      useTabs: true,
      endOfLine: 'auto',
    });
  });
});

describe('formattedText', () => {
  it('answers the text of a document that is not in canonical form', async () => {
    const text = await formattedText(MESSY, EDITOR);
    expect(text).toBeTypeOf('string');
    expect(text).not.toBe(MESSY);
  });

  it('answers nothing at all for a document already formatted', async () => {
    // The distinction the editor cares about: no edit is not the same as an edit that changes
    // nothing. A zero-width edit dirties the buffer and moves the undo stack, on every save.
    const canonical = await formattedText(MESSY, EDITOR);
    expect(await formattedText(canonical!, EDITOR)).toBeUndefined();
  });

  it('answers nothing at all while the document does not parse', async () => {
    expect(await formattedText('<app-badge>\n  <p>x\n', EDITOR)).toBeUndefined();
  });

  it('formats one range when it is given one', async () => {
    const source = '<app-badge>\n  <template shadowrootmode="open">\n    <p   >x</p>\n  </template>\n</app-badge>\n';
    const at = source.indexOf('<p   >');
    const text = await formattedText(source, EDITOR, { start: at, end: at + 6 });
    expect(text).toContain('<p>x</p>');
  });
});
