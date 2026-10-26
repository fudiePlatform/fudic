/**
 * SDD-61 §4.3 — `@empty` as a control keyword of the TextMate grammar.
 *
 * Like `} else {`, a continuation of the loop's block: neither loose text nor the end of it.
 */

import { describe, expect, it } from 'vitest';
import { find, has, tokenize } from './_tokenize.js';

describe('`@empty`', () => {
  it.each([
    ['@foreach', '@foreach (const x of xs) key (x.id) {'],
    ['@for', '@for (let i = 0; i < n; i++) key (i) {'],
    ['@while', '@while (go) key (go.id) {'],
  ])('reads `} @empty {` after a %s as a keyword that continues the block', async (_, head) => {
    const tokens = await tokenize(`${head}\n  <p>x</p>\n} @empty {\n  <p>none</p>\n}\n<p>after</p>\n`);

    expect(has(find(tokens, 'empty'), 'keyword.control.directive')).toBe(true);
    expect(has(find(tokens, 'none'), 'meta.block.control')).toBe(true);
    expect(has(find(tokens, 'after'), 'meta.block.control')).toBe(false);
  });

  it('marks its `@` as the punctuation of a keyword', async () => {
    const tokens = await tokenize('@foreach (const x of xs) key (x) {\n} @empty {\n}\n');
    const marks = tokens.filter((token) => token.text === '@' && has(token, 'punctuation.definition.keyword'));

    expect(marks.map((token) => token.line)).toEqual([0, 1]);
  });
});
