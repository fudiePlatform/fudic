/**
 * The TextMate scopes of `...item` (props-spec §5): the dots as an operator, the object as a
 * variable — and nothing of it when the dots are not an attribute of their own.
 */

import { describe, expect, it } from 'vitest';
import { find, findExact, tokenize, type Token } from './_tokenize.js';

const has = (token: Token, scope: string): boolean => token.scopes.some((s) => s.startsWith(scope));

describe('binding-spread', () => {
  it('scopes the dots and the object', async () => {
    const tokens = await tokenize('<app-card ...item></app-card>\n');
    expect(has(findExact(tokens, '...'), 'keyword.operator.spread.fudic')).toBe(true);
    expect(has(find(tokens, 'item'), 'variable.other.readwrite.binding.spread.fudic')).toBe(true);
  });

  it('takes a property path as one object', async () => {
    const tokens = await tokenize('<app-card ...row.data .x="@y"></app-card>\n');
    expect(has(find(tokens, 'row.data'), 'variable.other.readwrite.binding.spread.fudic')).toBe(true);
    // The `.prop` after it is still a property, not part of the spread.
    expect(has(find(tokens, 'x'), 'entity.other.attribute-name.binding.property')).toBe(true);
  });

  it('scopes bare dots while the object is still being typed', async () => {
    const tokens = await tokenize('<app-card ...></app-card>\n');
    expect(has(findExact(tokens, '...'), 'keyword.operator.spread.fudic')).toBe(true);
  });

  it('leaves dots inside a value alone', async () => {
    const tokens = await tokenize('<p title="a ...b"></p>\n');
    expect(tokens.some((t) => has(t, 'keyword.operator.spread.fudic'))).toBe(false);
  });
});
