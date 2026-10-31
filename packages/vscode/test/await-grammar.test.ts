/**
 * SDD-70 — `@await` and `@catch (e)` as control keywords of the TextMate grammar.
 *
 * `@await data.users {` opens a control block like `@if (…) {`; `} @catch (e) {` continues it like
 * `} else {`, with the name of the problem as a parameter.
 */

import { describe, expect, it } from 'vitest';
import { find, findExact, has, tokenize } from './_tokenize.js';

const SOURCE = '@await data.users {\n  <p>body</p>\n} @catch (e) {\n  <p>failed</p>\n}\n<p>after</p>\n';

describe('`@await`', () => {
  it('reads the keyword as a control directive and its body as a control block', async () => {
    const tokens = await tokenize(SOURCE);

    expect(has(find(tokens, 'await'), 'keyword.control.directive')).toBe(true);
    expect(has(find(tokens, 'body'), 'meta.block.control')).toBe(true);
    expect(has(find(tokens, 'after'), 'meta.block.control')).toBe(false);
  });

  it('marks the `@` of both words as the punctuation of a keyword', async () => {
    const tokens = await tokenize(SOURCE);
    const marks = tokens.filter((token) => token.text === '@' && has(token, 'punctuation.definition.keyword'));

    expect(marks.map((token) => token.line)).toEqual([0, 2]);
  });
});

describe('`@catch (e)`', () => {
  it('continues the block: a keyword, its name a parameter, its body still inside', async () => {
    const tokens = await tokenize(SOURCE);

    expect(has(find(tokens, 'catch'), 'keyword.control.directive')).toBe(true);
    expect(has(findExact(tokens, 'e'), 'variable.parameter')).toBe(true);
    expect(has(find(tokens, 'failed'), 'meta.block.control')).toBe(true);
  });

  it('marks its parentheses and its braces', async () => {
    const tokens = await tokenize(SOURCE);
    const line = tokens.filter((token) => token.line === 2);

    expect(has(line.find((token) => token.text === '}')!, 'punctuation.section.block.end')).toBe(true);
    expect(has(line.find((token) => token.text === '(')!, 'punctuation.section.parens.begin')).toBe(true);
    expect(has(line.find((token) => token.text === ')')!, 'punctuation.section.parens.end')).toBe(true);
    expect(has(line.find((token) => token.text === '{')!, 'punctuation.section.block.begin')).toBe(true);
  });
});
