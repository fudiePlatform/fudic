/**
 * SDD-23 §6: the base case and the nine mutants.
 *
 * Every expectation here is a rule of the grammar that has **no validator of its own** —
 * the projection turns it into something the TypeScript checker already knows how to
 * report. The test asserts both the code and the span in the `.fud`, because a right error
 * in the wrong place is a wrong error.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { typecheckCorpus, type CorpusDiagnostic } from './typecheck.js';

const FIXTURES = resolve(fileURLToPath(new URL('../fixtures', import.meta.url)));
const SLUG = 'blog/[slug].fud';

const read = (path: string): string => readFileSync(resolve(FIXTURES, path), 'utf8');

/** Apply a textual mutation to one corpus file. */
function mutate(path: string, from: string, to: string): Record<string, string> {
  const source = read(path);
  if (!source.includes(from)) throw new Error(`mutation anchor not found: ${from}`);
  return { [path]: source.replace(from, to) };
}

const describeDiag = (d: CorpusDiagnostic): string =>
  `${d.fud} ${d.code} ${d.message} @${d.sourceText ?? '<unmapped>'}`;

describe('base case', () => {
  it('typechecks the whole corpus with zero errors', () => {
    expect(typecheckCorpus().map(describeDiag)).toEqual([]);
  });
});

describe('mutants', () => {
  it('A — a value outside the prop union is TS2322 on the value', () => {
    const diags = typecheckCorpus(
      mutate(SLUG, `tone="@(data.found ? 'info' : 'neutral')"`, `tone="@('bogus')"`),
    );

    expect(diags).toHaveLength(1);
    expect(diags[0]!.code).toBe(2322);
    expect(diags[0]!.fud).toBe(SLUG);
    // TypeScript anchors an object-literal mismatch on the PROPERTY, exactly as it does for
    // a JSX attribute — so the mapping lands on the attribute name, not on the value. The
    // SDD's §6 wording ("`'bogus'` not assignable") describes the message, not the span.
    expect(diags[0]!.sourceText).toBe('tone');
    expect(diags[0]!.message).toContain('bogus');
  });

  it('B — a @server symbol used in the template is TS2304', () => {
    const diags = typecheckCorpus(mutate(SLUG, '<h1>@data.title</h1>', '<h1>@findPost</h1>'));

    expect(diags).toHaveLength(1);
    expect(diags[0]!.code).toBe(2304);
    expect(diags[0]!.sourceText).toBe('findPost');
  });

  it('C — a section the layout does not declare is TS2345 on the name', () => {
    const diags = typecheckCorpus(mutate(SLUG, '@section nav {', '@section footer {'));

    expect(diags).toHaveLength(1);
    expect(diags[0]!.code).toBe(2345);
    expect(diags[0]!.sourceText).toBe('footer');
  });

  it('D — a tag with no <link> is TS2304 on the tag', () => {
    const diags = typecheckCorpus({
      [SLUG]: read(SLUG)
        .replace('<app-badge .tone', '<app-missing .tone')
        .replace('</app-badge>', '</app-missing>'),
    });

    expect(diags).toHaveLength(1);
    expect(diags[0]!.code).toBe(2304);
    expect(diags[0]!.sourceText).toBe('app-missing');
  });

  it('E — interpolating an object is TS2345: only scalars interpolate (decision 19)', () => {
    const diags = typecheckCorpus(mutate(SLUG, '<h1>@data.title</h1>', '<h1>@data</h1>'));

    expect(diags).toHaveLength(1);
    expect(diags[0]!.code).toBe(2345);
    expect(diags[0]!.sourceText).toBe('data');
  });

  it('F — a misspelt attribute is TS2561, with the right suggestion', () => {
    const diags = typecheckCorpus(mutate(SLUG, '<site-nav .current=', '<site-nav .currnt='));

    expect(diags).toHaveLength(1);
    expect(diags[0]!.code).toBe(2561);
    expect(diags[0]!.sourceText).toBe('currnt');
    expect(diags[0]!.message).toContain('current');
  });

  it('G — narrowing inside @if works: zero errors', () => {
    const diags = typecheckCorpus(
      mutate(
        SLUG,
        '  <p>@data.body</p>',
        '  <p>@data.body</p>\n  @if (data.note !== undefined) {\n    <p>@(data.note.toUpperCase())</p>\n  }',
      ),
    );

    expect(diags.map(describeDiag)).toEqual([]);
  });

  it('H — changing the contract of load() breaks the template, untouched', () => {
    const diags = typecheckCorpus(
      mutate(SLUG, 'Promise<PageData> {', 'Promise<Omit<PageData, "body">> {'),
    );

    expect(diags.some((d) => d.code === 2339 && d.sourceText === 'body')).toBe(true);
  });

  /**
   * SDD-40 §6.12 — the layout contract, and whose voice says so.
   *
   * The fact is TypeScript's, over the projection: the route's `layout(ctx, data)` is given
   * the layout's `$Props` as its return type, so the error lands on the author's own object
   * literal. Nothing of ours reports it a second time — in the editor what the server adds
   * is the repair, not a second opinion (SDD-36 §3.1).
   */
  it('J — a required layout prop the route drops is TS on the author’s own return', () => {
    const diags = typecheckCorpus(
      mutate(SLUG, "return { culture: data.found ? 'es' : 'en' };", 'return { theme: "dark" };'),
    );

    expect(diags).toHaveLength(1);
    expect(diags[0]!.fud).toBe(SLUG);
    // On the author's own `return`, which is where TypeScript anchors a return-type
    // mismatch — the point being that it is HIS text and not a synthetic assignment.
    expect(diags[0]!.sourceText).toBe('return');
    expect(diags[0]!.message).toContain('culture');
  });

  it('J2 — a layout prop of the wrong type is reported on the value', () => {
    const diags = typecheckCorpus(
      mutate(SLUG, "return { culture: data.found ? 'es' : 'en' };", 'return { culture: 7 };'),
    );

    expect(diags).toHaveLength(1);
    expect(diags[0]!.code).toBe(2322);
    expect(diags[0]!.sourceText).toBe('culture');
  });

  it('J3 — a resolver that returns what the layout declares says nothing', () => {
    const diags = typecheckCorpus(
      mutate(
        SLUG,
        "return { culture: data.found ? 'es' : 'en' };",
        'return { culture: "gl", theme: "dark" };',
      ),
    );

    expect(diags.map(describeDiag)).toEqual([]);
  });

  it('I — the item of a @foreach carries its type', () => {
    const diags = typecheckCorpus({
      [SLUG]: read(SLUG)
        .replace(
          '  type PageData',
          '  const xs = [{ ok: 1 }];\n  type PageData',
        )
        .replace(
          '  <p>@data.body</p>',
          '  <p>@data.body</p>\n  @foreach (const it of xs) {\n    <span>@it.nope</span>\n  }',
        ),
    });

    expect(diags).toHaveLength(1);
    expect(diags[0]!.code).toBe(2339);
    expect(diags[0]!.sourceText).toBe('nope');
  });
});
