/**
 * SDD-61 §4.3 — `} @empty {` on the line of the loop's `}`, as `} else {`.
 */

import { describe, expect, it } from 'vitest';
import { format, formatWith } from '../../src/format.js';
import { childrenOf } from '../../src/range.js';
import { FakeEngine, parse } from '../_support.js';

/** Print with an engine that hands every fragment back untouched: this is about the shape. */
async function print(source: string): Promise<string> {
  const result = await formatWith(new FakeEngine(), source, {});
  if (!result.ok) throw new Error(`refused: ${JSON.stringify(result.diagnostics)}`);
  return result.text;
}

describe('`@empty`', () => {
  it.each([
    ['@foreach', '@foreach (const i of xs) key (i) {\n  <p>@i</p>\n} @empty {\n  <p>none</p>\n}'],
    ['@for', '@for (let i = 0; i < n; i++) key (i) {\n  <p>@i</p>\n} @empty {\n  <p>none</p>\n}'],
    ['@while', '@while (go) key (go.id) {\n  <p>x</p>\n} @empty {\n  <p>none</p>\n}'],
  ])('keeps the canonical shape after a %s', async (_, source) => {
    expect(await print(source)).toBe(`${source}\n`);
  });

  it('brings `@empty` up to the line of the `}`, however it was written', async () => {
    expect(await print('@foreach (const i of xs) key (i) {\n  <p>@i</p>\n}\n\n@empty\n{\n  <p>none</p>\n}')).toBe(
      '@foreach (const i of xs) key (i) {\n  <p>@i</p>\n} @empty {\n  <p>none</p>\n}\n',
    );
  });

  it('keeps a comment written between the `}` and the `@empty`', async () => {
    expect(await print('@foreach (const i of xs) key (i) { <p>@i</p> } @* none *@ @empty { <p>none</p> }')).toBe(
      '@foreach (const i of xs) key (i) { <p>@i</p> } @* none *@ @empty { <p>none</p> }\n',
    );
  });

  it('measures the hole from the key when the body is empty', async () => {
    expect(await print('@foreach (const i of xs) key (i) {}\n@empty { <p>none</p> }')).toBe(
      '@foreach (const i of xs) key (i) {} @empty { <p>none</p> }\n',
    );
  });

  it('measures it from the header when there is no key either', async () => {
    // A loop with no markup in it needs no key (decision 91).
    expect(await print('@while (go) {}\n@empty { <p>none</p> }')).toBe('@while (go) {} @empty { <p>none</p> }\n');
  });

  it('formats the leaves inside the body, with the real engine, and is idempotent', async () => {
    const source = '@foreach (const i of xs) key (i) {\n  <p>@i</p>\n} @empty {\n  <p>@(  a  +  b  )</p>\n}';
    const once = await format(source);
    const formatted = once.ok ? once.text : '';
    expect(formatted).toContain('@(a + b)');

    const twice = await format(formatted);
    expect(twice.ok && twice.text).toBe(formatted);
  });

  it('counts the body among the children of the loop', () => {
    const [loop] = parse('@while (go) key (go.id) { <p>x</p> } @empty { <b>y</b> }').children;
    const names = childrenOf(loop!).flatMap((child) => (child.type === 'element' ? [child.name] : []));
    expect(names).toEqual(['p', 'b']);
  });

  it('counts only the body when the loop has none', () => {
    const [loop] = parse('@while (go) key (go.id) { <p>x</p> }').children;
    expect(childrenOf(loop!).filter((child) => child.type === 'element')).toHaveLength(1);
  });
});
