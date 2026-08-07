/**
 * Criteria §6.2, §6.9, §6.11 and §6.12: the errors an editor shows.
 *
 * The nine mutants of SDD-23 §6 are checked again here, and for a different reason: SDD-23 proved
 * the PROJECTION yields them, this proves they arrive as LSP diagnostics **on the span of the
 * `.fud`**. It is the test of the inverse mapping, end to end.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DocumentDiagnosticRequest,
  type Diagnostic,
  type FullDocumentDiagnosticReport,
} from 'vscode-languageserver-protocol/node';
import { fixtureText, startHarness, type Harness } from './_harness.js';

const SLUG = 'blog/[slug].fud';
const BADGE = 'components/app-badge.fud';

let harness: Harness;
let version = 1;

/** Re-write a document and pull its diagnostics, as an editor does after each edit. */
async function diagnosticsOf(uri: string, text: string): Promise<Diagnostic[]> {
  await harness.change(uri, text, ++version);
  const report = (await harness.client.sendRequest(DocumentDiagnosticRequest.type, {
    textDocument: { uri },
  })) as FullDocumentDiagnosticReport;

  // Errors and warnings only. TypeScript also emits suggestion-level hints — «`PageData` is
  // declared but never used» is one, because the client projection carries the neutral zone
  // without the `@server` region that uses it — and §6.2 is about the errors an editor shows
  // in red, not about tsserver's advice on the projection.
  return report.items.filter((item) => (item.severity ?? 1) <= 2);
}

/** The text under a diagnostic, so a span can be asserted without counting characters. */
const textAt = (source: string, diagnostic: Diagnostic): string => {
  const lines = source.split('\n');
  const { start, end } = diagnostic.range;
  if (start.line === end.line) {
    return (lines[start.line] ?? '').slice(start.character, end.character);
  }
  return (lines[start.line] ?? '').slice(start.character);
};

const mutate = (source: string, from: string, to: string): string => source.replace(from, to);

beforeAll(async () => {
  harness = await startHarness();
}, 60_000);

afterAll(async () => {
  await harness.stop();
});

describe('§6.2 — the nine mutants of SDD-23, as LSP diagnostics on the .fud', () => {
  let slugUri: string;
  let slug: string;

  beforeAll(async () => {
    const opened = await harness.open(SLUG);
    slugUri = opened.uri;
    slug = opened.text;
    await harness.open(BADGE);
  });

  it('the corpus itself is clean', async () => {
    expect(await diagnosticsOf(slugUri, slug)).toEqual([]);
  });

  it('A — a value outside the prop union', async () => {
    const source = mutate(slug, `tone="@(data.found ? 'info' : 'neutral')"`, `tone="@('bogus')"`);
    const [diagnostic, ...rest] = await diagnosticsOf(slugUri, source);

    expect(rest).toEqual([]);
    expect(diagnostic?.code).toBe(2322);
    expect(textAt(source, diagnostic!)).toBe('tone');
    expect(String(diagnostic?.message)).toContain('bogus');
  });

  it('B — a @server symbol used in the template', async () => {
    const source = mutate(slug, '<h1>@data.title</h1>', '<h1>@findPost</h1>');
    const [diagnostic, ...rest] = await diagnosticsOf(slugUri, source);

    expect(rest).toEqual([]);
    expect(diagnostic?.code).toBe(2304);
    expect(textAt(source, diagnostic!)).toBe('findPost');
  });

  it('C — a section the layout does not declare', async () => {
    const source = mutate(slug, '@section nav {', '@section footer {');
    const [diagnostic, ...rest] = await diagnosticsOf(slugUri, source);

    expect(rest).toEqual([]);
    expect(diagnostic?.code).toBe(2345);
    expect(textAt(source, diagnostic!)).toBe('footer');
  });

  it('D — a tag with no <link>', async () => {
    const source = slug
      .replace('<app-badge .tone', '<app-missing .tone')
      .replace('</app-badge>', '</app-missing>');
    const diagnostics = await diagnosticsOf(slugUri, source);

    // Two layers report it, and both land on the tag: the semantic pass of SDD-12 (FUD0191,
    // decision 41) and the checker over the projection (TS2304 on `$C_app_missing`).
    expect(new Set(diagnostics.map((diagnostic) => diagnostic.code))).toEqual(
      new Set(['FUD0191', 2304]),
    );
    // The checker lands on the tag name itself; the semantic pass underlines the element it
    // belongs to, which is the span SDD-12 gives that rule.
    for (const diagnostic of diagnostics) {
      expect(textAt(source, diagnostic)).toContain('app-missing');
    }
    expect(textAt(source, diagnostics.find((d) => d.code === 2304)!)).toBe('app-missing');
  });

  it('E — interpolating an object', async () => {
    const source = mutate(slug, '<h1>@data.title</h1>', '<h1>@data</h1>');
    const [diagnostic, ...rest] = await diagnosticsOf(slugUri, source);

    expect(rest).toEqual([]);
    expect(diagnostic?.code).toBe(2345);
    expect(textAt(source, diagnostic!)).toBe('data');
  });

  it('F — a misspelt attribute, with its suggestion', async () => {
    const source = mutate(slug, '<site-nav .current=', '<site-nav .currnt=');
    const [diagnostic, ...rest] = await diagnosticsOf(slugUri, source);

    expect(rest).toEqual([]);
    expect(diagnostic?.code).toBe(2561);
    expect(textAt(source, diagnostic!)).toBe('currnt');
    expect(String(diagnostic?.message)).toContain('current');
  });

  it('G — narrowing inside @if is understood, and reports nothing', async () => {
    const source = mutate(
      slug,
      '  <p>@data.body</p>',
      '  <p>@data.body</p>\n  @if (data.note !== undefined) {\n    <p>@(data.note.toUpperCase())</p>\n  }',
    );

    expect(await diagnosticsOf(slugUri, source)).toEqual([]);
  });

  it('H — changing the contract of load() breaks the template it never touched', async () => {
    const source = mutate(slug, 'Promise<PageData> {', 'Promise<Omit<PageData, "body">> {');
    const diagnostics = await diagnosticsOf(slugUri, source);

    expect(
      diagnostics.some(
        (diagnostic) => diagnostic.code === 2339 && textAt(source, diagnostic) === 'body',
      ),
    ).toBe(true);
  });

  it('I — the item of a @foreach carries its type', async () => {
    const source = slug
      .replace('  type PageData', '  const xs = [{ ok: 1 }];\n  type PageData')
      .replace(
        '  <p>@data.body</p>',
        '  <p>@data.body</p>\n  @foreach (const it of xs) {\n    <span>@it.nope</span>\n  }',
      );
    const diagnostics = await diagnosticsOf(slugUri, source);

    expect(
      diagnostics.some(
        (diagnostic) => diagnostic.code === 2339 && textAt(source, diagnostic) === 'nope',
      ),
    ).toBe(true);
  });
});

describe('BUG-16 §6.14 — the two literals of a component tag, end to end', () => {
  let slugUri: string;
  let slug: string;

  beforeAll(async () => {
    const opened = await harness.open(SLUG);
    slugUri = opened.uri;
    slug = opened.text;
    await harness.open(BADGE);
  });

  it('takes the global vocabulary of HTML on a component (BUG-11 §6.9)', async () => {
    const source = mutate(
      slug,
      '<app-badge .tone',
      '<app-badge id="b" class="x" role="note" data-k="1" aria-label="badge" .tone',
    );

    // They are not props and they never were: they go to the second literal, checked against
    // `$GlobalAttrs`, and nothing there is wrong.
    expect(await diagnosticsOf(slugUri, source)).toEqual([]);
  });

  it('a prop written as a plain attribute is an error on its name (§4.2)', async () => {
    const source = mutate(slug, '<app-badge .tone', '<app-badge tone="info" .tone');
    const [diagnostic, ...rest] = await diagnosticsOf(slugUri, source);

    // TypeScript's, and better than one of ours: it lands on the name the user wrote.
    expect(rest).toEqual([]);
    expect(diagnostic?.code).toBe(2353);
    expect(textAt(source, diagnostic!)).toBe('tone');
  });

  it('a misspelt global keeps the suggestion (§6.6)', async () => {
    const source = mutate(slug, '<app-badge .tone', '<app-badge titel="b" .tone');
    const [diagnostic, ...rest] = await diagnosticsOf(slugUri, source);

    expect(rest).toEqual([]);
    expect(diagnostic?.code).toBe(2561);
    expect(textAt(source, diagnostic!)).toBe('titel');
    expect(String(diagnostic?.message)).toContain('title');
  });
});

describe('§6.9 — inter-file', () => {
  it('changing Tone in app-badge.fud repaints [slug].fud, untouched', async () => {
    const badge = await harness.open(BADGE);
    const slug = await harness.open(SLUG);

    expect(await diagnosticsOf(slug.uri, slug.text)).toEqual([]);

    // `info` disappears from the union; the page passes it and must now be wrong.
    await harness.change(
      badge.uri,
      badge.text.replace(`type Tone = 'neutral' | 'success' | 'info';`, `type Tone = 'neutral';`),
      ++version,
    );

    const report = (await harness.client.sendRequest(DocumentDiagnosticRequest.type, {
      textDocument: { uri: slug.uri },
    })) as FullDocumentDiagnosticReport;

    expect(report.items.length).toBeGreaterThan(0);
    expect(report.items[0]?.code).toBe(2322);

    await harness.change(badge.uri, badge.text, ++version);
  });
});

describe('§6.11 — the reserved $ namespace, while typing', () => {
  it('reports const $x = 1 in @client with the exact span, and leaves foo$ alone', async () => {
    const badge = await harness.open(BADGE);
    const source = badge.text.replace(
      '@code {',
      '@code {\n  @client {\n    const $x = 1;\n    const foo$ = 2;\n    const read = { $bar: 1 }.$bar;\n  }\n',
    );

    const diagnostics = await diagnosticsOf(badge.uri, source);
    const ours = diagnostics.filter((diagnostic) => diagnostic.code === 'FUD0461');

    expect(ours.length).toBe(1);
    expect(textAt(source, ours[0]!)).toBe('$x');

    await harness.change(badge.uri, fixtureText(BADGE), ++version);
  });
});

describe('BUG-15 §6.12 — offering is not validating', () => {
  it('a class no <style> declares produces no diagnostic at all', async () => {
    const badge = await harness.open(BADGE);
    // A class this file cannot know about and that is perfectly legitimate: one that arrives
    // from an external stylesheet, or that an ancestor paints, or that is not written yet.
    const source = fixtureText(BADGE).replace(
      `class:info="@(tone === 'info')"`,
      `class:info="@(tone === 'info')"\n      class:from-a-global-sheet="@(tone === 'info')"`,
    );

    // Not «no NEW code»: no diagnostic whatsoever over it. The list is open (§4.4), and an
    // open list that quietly tightened some other rule would be the same bug in reverse.
    const onTheClass = (await diagnosticsOf(badge.uri, source)).filter((diagnostic) =>
      textAt(source, diagnostic).includes('from-a-global-sheet'),
    );
    expect(onTheClass).toEqual([]);

    await harness.change(badge.uri, fixtureText(BADGE), ++version);
  });
});

describe('§6.12 — tolerance', () => {
  it('survives an unclosed <div> and still answers', async () => {
    const slug = await harness.open(SLUG);
    const source = slug.text.replace('<article>', '<article><div>');

    const diagnostics = await diagnosticsOf(slug.uri, source);

    expect(Array.isArray(diagnostics)).toBe(true);
    // The server is still there: the next request answers.
    expect(await diagnosticsOf(slug.uri, slug.text)).toEqual([]);
  });
});
