/** SDD-83 §3.2: the comments of the batch, mapped back to the `.fud` as written there. */

import { describe, expect, it } from 'vitest';
import { JsBatch } from '../../src/index.js';

describe('JsBatchResult.comments', () => {
  it('every comment of every fragment, in source coordinates, delimiters included', () => {
    const source = '<p>@(/* in expr */ a)</p>\n@code {\n  // fud-disable-next-line FUD1380: r\n  const b = 1;\n}\n';
    const batch = new JsBatch(source);
    const expr = source.indexOf('/* in expr */');
    batch.add('expression', { start: expr, end: source.indexOf(')</p>') });
    const body = source.indexOf('\n  //');
    batch.add('module-statements', { start: body, end: source.lastIndexOf('}') });

    const { comments } = batch.parse().value;
    expect(comments.map((c) => c.text)).toEqual(['/* in expr */', '// fud-disable-next-line FUD1380: r']);
    for (const c of comments) expect(source.slice(c.span.start, c.span.end)).toBe(c.text);
  });

  it('none when the JS has none', () => {
    const batch = new JsBatch('a + b');
    batch.add('expression', { start: 0, end: 5 });
    expect(batch.parse().value.comments).toEqual([]);
  });
});
