/**
 * BUG-23 — the grammar half of the measurement, against the code that opened the bug.
 *
 * The other seven symptoms are things an editor does or does not say and live in
 * `language-server/test/acceptance/bug23-symptoms.test.ts`. These are the ones the compiler
 * owns on its own: the `@` that needs parentheses it should not need (§2.3), and the dangling
 * dot the editor cannot ask from (§2.2).
 *
 * Written RED first (task 1), with the same convention as the acceptance file: what is not
 * fixed yet is `it.fails`, so the suite is green at every commit and the flip to a plain `it`
 * is the proof the phase landed.
 */

import { describe, expect, it } from 'vitest';
import { parseDocument, type AtConstructParser } from '../src/html/index.js';
import { parseControl } from '../src/control/index.js';
import { parseCodeBlock } from '../src/code/index.js';
import { scanImplicitExpression } from '../src/at/index.js';

const constructs: AtConstructParser = { parseControl, parseCodeBlock };

/** The diagnostic codes a source parses with. */
function codes(source: string): readonly string[] {
  return parseDocument(source, { atConstructs: constructs }).diagnostics.map((d) => d.code);
}

/** The text of the implicit expression a source that is a single `@` atom resolves to. */
function implicit(source: string): string {
  const { value } = scanImplicitExpression(source, 0);
  return source.slice(value.span.start, value.span.end);
}

describe('§2.3 — the implicit expression is a chain (task 2)', () => {
  it('takes a call anywhere in the chain', () => {
    expect(implicit('@counter().id')).toBe('@counter().id');
  });

  it('takes an index and an optional chain', () => {
    expect(implicit('@a?.b[0].c(x)')).toBe('@a?.b[0].c(x)');
  });

  it('never crosses whitespace (decision 101)', () => {
    expect(implicit('@del (x)')).toBe('@del');
  });
});

describe('§2.3 — an unquoted value can be one `@` expression (task 4)', () => {
  it('takes `.prop=@name` with no FUD0056', () => {
    expect(codes('<app-circle .name=@titulo></app-circle>')).toEqual([]);
  });

  it('takes an event written the same way', () => {
    expect(codes('<div @click=@onClick($event)></div>')).toEqual([]);
  });

  it('still refuses a bare word (decision 8 stands)', () => {
    expect(codes('<div id=foo></div>')).toContain('FUD0056');
  });
});

describe('§2.2 — the dangling dot', () => {
  it('keeps the dot out of the expression (decision 2)', () => {
    expect(implicit('@data.')).toBe('@data');
  });
});
