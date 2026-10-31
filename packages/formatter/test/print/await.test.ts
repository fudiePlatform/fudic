/**
 * SDD-70 criterion 8 — `@await … { } @catch (e) { }` keeps the shape of `@if … { } else { }`: the
 * `@catch` on the line of the `}`, and the whole idempotent.
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

describe('`@await`', () => {
  it.each([
    ['with a catch', '@await data.users {\n  <p>@data.users.length</p>\n} @catch (e) {\n  <p>@e.status</p>\n}'],
    ['without one', '@await data.users {\n  <p>@data.users.length</p>\n}'],
  ])('keeps the canonical shape %s', async (_, source) => {
    expect(await print(source)).toBe(`${source}\n`);
  });

  it('prints it as `@if … { } else { }` is printed', async () => {
    const shape = (text: string): string => text.replace(/@if \(a\)|@await data\.users/u, 'HEAD').replace(/else|@catch \(e\)/u, 'TAIL');
    const written = (head: string, tail: string): string => `${head}\n{\n<p>x</p>\n}\n\n${tail}\n{\n<p>y</p>\n}`;
    const ifElse = await print(written('@if (a)', 'else'));
    const awaitCatch = await print(written('@await data.users', '@catch (e)'));
    expect(shape(awaitCatch)).toBe(shape(ifElse));
    expect(awaitCatch).toBe('@await data.users {\n  <p>x</p>\n} @catch (e) {\n  <p>y</p>\n}\n');
  });

  it('keeps a comment written between the `}` and the `@catch`', async () => {
    expect(await print('@await data.users { <p>x</p> } @* failed *@ @catch (e) { <p>y</p> }')).toBe(
      '@await data.users { <p>x</p> } @* failed *@ @catch (e) { <p>y</p> }\n',
    );
  });

  it('measures the hole from the expression when the body is empty', async () => {
    expect(await print('@await data.users {}\n@catch (e) { <p>none</p> }')).toBe('@await data.users {} @catch (e) { <p>none</p> }\n');
  });

  it('formats what is awaited and the leaves of both blocks, with the real engine, and is idempotent', async () => {
    const source = '@await   data.users {\n  <p>@(  a  +  b  )</p>\n}\n@catch(e){\n  <p>@(  c  +  d  )</p>\n}';
    const once = await format(source);
    const formatted = once.ok ? once.text : '';
    expect(formatted).toBe('@await data.users {\n  <p>@(a + b)</p>\n} @catch (e) {\n  <p>@(c + d)</p>\n}\n');

    const twice = await format(formatted);
    expect(twice.ok && twice.text).toBe(formatted);
  });

  it('counts both blocks among its children', () => {
    const [node] = parse('@await data.users { <p>x</p> } @catch (e) { <b>y</b> }').children;
    const names = childrenOf(node!).flatMap((child) => (child.type === 'element' ? [child.name] : []));
    expect(names).toEqual(['p', 'b']);
  });

  it('counts only the body when it has no catch', () => {
    const [node] = parse('@await data.users { <p>x</p> }').children;
    expect(childrenOf(node!).filter((child) => child.type === 'element')).toHaveLength(1);
  });
});
