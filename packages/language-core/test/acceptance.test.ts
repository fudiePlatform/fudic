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

describe('the events of a sent form (BUG-51)', () => {
  const withForm = (attrs: string): Record<string, string> =>
    mutate(SLUG, '<h1>@data.title</h1>', `<h1>@data.title</h1>\n  <form ${attrs}></form>`);

  it('`@fudic:result` and `@fudic:error` are events every element can listen to, as CustomEvents', () => {
    const diags = typecheckCorpus(
      withForm('@fudic:result="@((e: CustomEvent<unknown>) => e.detail)" @fudic:error="@((e) => e.detail)"'),
    );

    expect(diags.map(describeDiag)).toEqual([]);
  });

  it('a handler that expects another event is TS2345 on it', () => {
    const diags = typecheckCorpus(withForm('@fudic:result="@((e: MouseEvent) => e.button)"'));

    expect(diags).toHaveLength(1);
    expect(diags[0]!.code).toBe(2345);
  });

  it('and a name of the prefix that is not one of the two is no event at all', () => {
    const diags = typecheckCorpus(withForm('@fudic:resul="@((e) => e)"'));

    expect(diags).toHaveLength(1);
    expect(diags[0]!.code).toBe(2345);
    expect(diags[0]!.sourceText).toBe('fudic:resul');
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
    // The contract is the `.fudapi`'s now (SDD-60 §4.7): its `LoadData` is what `data` is.
    const diags = typecheckCorpus(mutate('fudic-api.d.ts', '    readonly body: string;\n', ''));

    expect(diags.some((d) => d.code === 2339 && d.sourceText === 'body')).toBe(true);
  });

  // J, J2 and J3 — the layout contract on the route's resolver (SDD-40 §6.12) — left with the
  // `@server` they wrote into: `layout.handle` is a `.ts` of `src/server` typed by the
  // `.d.ts` of the `.fudapi`, and `@fudic/typecheck` checks it (SDD-60 §3.4, §4.6).

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
