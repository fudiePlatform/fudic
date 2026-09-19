/**
 * `@snippet` and `@render` (SDD-29, task 14).
 *
 * The defect these close is not that the two nodes were lost — the default branch of the
 * dispatch printed the source slice, so nothing disappeared — but that they were printed as
 * a FROZEN slice. A construct that carries its own columns is wrong the moment anything
 * around it moves: the body of a declaration kept whatever indentation it was typed with,
 * and a call whose arguments spanned two lines kept the columns of a container that had
 * since been re-indented. Every test below is a case where "verbatim" and "formatted"
 * differ, which is the only kind that would have failed before.
 *
 * What the body must NOT have is rules of its own (SDD-29 §7), and that is checked the only
 * way it can be: by formatting the same markup at top level and comparing.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { format } from '../../src/index.js';

/** Format, and fail loudly rather than returning diagnostics as if they were text. */
async function fmt(source: string, width?: number): Promise<string> {
  const result = await format(source, width === undefined ? {} : { printWidth: width });
  if (!result.ok) throw new Error(`refused: ${JSON.stringify(result.diagnostics)}`);
  return result.text;
}

describe('a snippet declaration', () => {
  it('re-indents its body, whatever column it was written at', async () => {
    expect(
      await fmt('@snippet card(title: string) {\n<article>\n<h2>@title</h2>\n</article>\n}\n'),
    ).toBe('@snippet card(title: string) {\n  <article>\n    <h2>@title</h2>\n  </article>\n}\n');
  });

  it('hands its signature to the leaf formatter', async () => {
    // `title:string` is not what the author gets back: a parameter list is TS, and it is
    // normalized by the same engine that normalizes a `@if` header.
    expect(await fmt('@snippet card(title:string,n:number=1) {\n  <p>@title</p>\n}\n')).toBe(
      '@snippet card(title: string, n: number = 1) {\n  <p>@title</p>\n}\n',
    );
  });

  it('prints an empty signature and an empty body without inventing anything', async () => {
    expect(await fmt('@snippet a() {}\n')).toBe('@snippet a() {}\n');
  });

  it('formats the constructs inside the body like any other html block', async () => {
    const body = '@if (a) {\n  <p>x</p>\n}';
    const inside = await fmt(`@snippet s(a: boolean) {\n${body}\n}\n`);
    // The body indented one level, and nothing else: the same text formatted on its own.
    const alone = await fmt('@if (a) {\n<p>x</p>\n}\n');
    expect(inside).toBe(
      `@snippet s(a: boolean) {\n${alone
        .trimEnd()
        .split('\n')
        .map((line) => `  ${line}`)
        .join('\n')}\n}\n`,
    );
  });
});

describe('a render call', () => {
  it('collapses a header split across lines back onto the call', async () => {
    expect(await fmt('<div>\n        @render card("A",\n   variant:  1)\n</div>\n')).toBe(
      '<div>\n  @render card("A", variant: 1)\n</div>\n',
    );
  });

  it('keeps its namespace, and its arguments in order', async () => {
    expect(await fmt('<div>@render form.card("A", variant: "b")</div>\n')).toBe(
      '<div>@render form.card("A", variant: "b")</div>\n',
    );
  });

  it('prints a call with no arguments', async () => {
    expect(await fmt('@snippet a() {}\n<div>@render a()</div>\n')).toBe(
      '@snippet a() {}\n<div>@render a()</div>\n',
    );
  });

  it('hands each argument to the leaf formatter', async () => {
    expect(await fmt('<div>@render card( 1+2 , n:  {a:1} )</div>\n')).toBe(
      '<div>@render card(1 + 2, n: { a: 1 })</div>\n',
    );
  });
});

describe('the canonical fixture', () => {
  const path = fileURLToPath(new URL('../../fixtures/own/snippets.fud', import.meta.url));
  const source = readFileSync(path, 'utf8');

  it('is already in canonical form, and stays there', async () => {
    // The round trip task 14 asks for: the file on disk is the formatter's own output, and
    // formatting it again is the identity. `fudic fmt --check` exits zero on this.
    const once = await fmt(source);
    expect(once).toBe(source);
    expect(await fmt(once)).toBe(once);
  });

  it('is idempotent at a margin narrow enough to force the breaks', async () => {
    const once = await fmt(source, 40);
    expect(await fmt(once, 40)).toBe(once);
  });
});
