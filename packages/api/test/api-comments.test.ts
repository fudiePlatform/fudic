/** SDD-83 §3.2: where a `fud-disable` of a `.fudapi` is written. */

import { describe, expect, it } from 'vitest';
import { apiComments } from '../src/index.js';

describe('apiComments', () => {
  it('every # comment, # included, with its span; a # inside quotes is not one', () => {
    const source = '# fud-disable-next-line FUD1340: r\nfn a  # tail\n  min-length 3 "a # b"\n';
    const found = apiComments(source);
    expect(found.map((c) => c.text)).toEqual(['# fud-disable-next-line FUD1340: r', '# tail']);
    for (const c of found) expect(source.slice(c.span.start, c.span.end)).toBe(c.text);
  });
});
