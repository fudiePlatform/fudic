/** SDD-83 §3.2: where a `fud-disable` of a `.fudspec` is written. */

import { describe, expect, it } from 'vitest';
import { specComments } from '../src/index.js';

describe('specComments', () => {
  it('every # comment, # included, with its span; a # inside quotes is not one', () => {
    const source = 'component fud-x\n# fud-disable FUD0972: r\ncriterion a  # tail\n  then\n    text "a # b"\n';
    const found = specComments(source);
    expect(found.map((c) => c.text)).toEqual(['# fud-disable FUD0972: r', '# tail']);
    for (const c of found) expect(source.slice(c.span.start, c.span.end)).toBe(c.text);
  });
});
