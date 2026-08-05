/**
 * SDD-28 criteria 1, 5, 7, 8, 9, 10 and 12 — over the live connection.
 *
 * The unit tests know the catalogue is right; what only this file can show is that it comes
 * out of a real `textDocument/completion` on a real server, over the fixture workspace. An
 * item that never leaves the process is not a feature.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CompletionRequest,
  DocumentDiagnosticRequest,
  type CompletionItem,
  type CompletionList,
  type FullDocumentDiagnosticReport,
  type TextEdit,
} from 'vscode-languageserver-protocol/node';
import { startHarness, type Harness } from './_harness.js';

/** Apply LSP edits to a text, last first so earlier offsets keep their meaning. */
function applyEdits(text: string, edits: readonly TextEdit[]): string {
  const lines = text.split('\n');
  const offsetAt = (position: { line: number; character: number }): number => {
    let offset = 0;
    for (let i = 0; i < position.line; i += 1) offset += (lines[i]?.length ?? 0) + 1;
    return offset + position.character;
  };
  const ordered = [...edits].sort((a, b) => offsetAt(b.range.start) - offsetAt(a.range.start));

  let out = text;
  for (const edit of ordered) {
    out = out.slice(0, offsetAt(edit.range.start)) + edit.newText + out.slice(offsetAt(edit.range.end));
  }
  return out;
}

const SLUG = 'blog/[slug].fud';
const BADGE = 'components/app-badge.fud';
const LAYOUT = 'layouts/_layout.fud';

let harness: Harness;
let version = 1;

/** Rewrite a fixture with the cursor at `|` and ask for completion there. */
async function completeAt(relative: string, marked: string): Promise<CompletionItem[]> {
  const { uri } = await harness.open(relative);
  const { text, position } = harness.cursor(marked);
  await harness.change(uri, text, ++version);

  const answer = await harness.client.sendRequest(CompletionRequest.type, {
    textDocument: { uri },
    position,
  });

  const list = answer as CompletionList | CompletionItem[] | null;
  if (list === null) return [];
  return Array.isArray(list) ? list : list.items;
}

const labels = (items: CompletionItem[]): string[] => items.map((item) => item.label);
const ours = (items: CompletionItem[]): CompletionItem[] =>
  items.filter((item) => item.labelDetails?.description?.startsWith('fudic') === true);

const ROUTE_HEAD = `<link rel="layout" href="../layouts/_layout.fud">\n`;

beforeAll(async () => {
  harness = await startHarness();
  await harness.open(BADGE);
  await harness.open('components/site-nav.fud');
  await harness.open(LAYOUT);
}, 60_000);

afterAll(async () => {
  await harness.stop();
});

describe('criterion 1 — the document skeletons', () => {
  it('a file with nothing but the word being typed offers the four', async () => {
    const items = await completeAt(SLUG, 'rou|');

    expect(labels(ours(items))).toEqual(['component', 'route', 'page', 'layout']);
    const route = items.find((item) => item.label === 'route');
    expect(route?.insertTextFormat).toBe(2);
    expect(route?.textEdit?.newText).toContain('<link rel="layout" href="${1:');
  });

  it('and none of them once the file has something in it', async () => {
    const items = await completeAt(SLUG, `${ROUTE_HEAD}<article>\n  rou|\n</article>\n`);

    expect(labels(ours(items))).not.toContain('route');
  });
});

describe('criteria 5 and 7 — control flow and directives, by place and by role', () => {
  it('a route offers the six control-flow constructs after a `@`', async () => {
    const items = await completeAt(SLUG, `${ROUTE_HEAD}<article>\n  @|\n</article>\n`);

    expect(labels(items)).toEqual(
      expect.arrayContaining(['@if', '@if else', '@foreach', '@for', '@while', '@switch']),
    );
  });

  it('a route offers @section and never @RenderBody', async () => {
    const items = await completeAt(SLUG, `${ROUTE_HEAD}\n@|\n\n<article>x</article>\n`);

    expect(labels(items)).toContain('@section');
    expect(labels(items)).not.toContain('@RenderBody');
  });

  it('a layout offers @RenderBody and @RenderHead, and never @section', async () => {
    // The `@RenderBody()` stays where it is: a shell without one is a standalone page, not a
    // layout (decision 82), and taking it out would be asking the wrong document.
    const items = await completeAt(
      LAYOUT,
      `<!DOCTYPE html>\n<html lang="es">\n  <head>\n    @RenderHead()\n  </head>\n  <body>\n    @|\n    <main>@RenderBody()</main>\n  </body>\n</html>\n`,
    );

    expect(labels(items)).toEqual(expect.arrayContaining(['@RenderBody', '@RenderHead']));
    expect(labels(items)).not.toContain('@section');
  });

  it('and none of them inside @code, where the language is TypeScript', async () => {
    const items = await completeAt(
      SLUG,
      `${ROUTE_HEAD}@code {\n  const value = 1;\n  @|\n}\n<article>x</article>\n`,
    );

    expect(labels(items)).not.toContain('@foreach');
  });
});

describe('criteria 8 and 9 — the zones, and the @code that appears once', () => {
  it('a component offers props inside its @code, and @client after a `@`', async () => {
    // A prefix is required: with nothing typed there is no word and no `@`, and the catalogue
    // stays out of the way of TypeScript, whose completions those are.
    const props = await completeAt(
      BADGE,
      `@code {\n  pro|\n}\n<app-badge>\n  <template shadowrootmode="open"></template>\n</app-badge>\n`,
    );
    expect(labels(ours(props))).toContain('props');

    const client = await completeAt(
      BADGE,
      `@code {\n  @|\n}\n<app-badge>\n  <template shadowrootmode="open"></template>\n</app-badge>\n`,
    );
    expect(labels(client)).toEqual(expect.arrayContaining(['@client', '@server']));
  });

  it('a route offers @code at top level, and stops once it has one', async () => {
    const empty = await completeAt(SLUG, `${ROUTE_HEAD}@co|\n<article>x</article>\n`);
    expect(labels(empty)).toContain('@code');

    const taken = await completeAt(
      SLUG,
      `${ROUTE_HEAD}@code {\n  const a = 1;\n}\n@co|\n<article>x</article>\n`,
    );
    expect(labels(taken)).not.toContain('@code');
  });
});

describe('criteria 10 and 12 — a tag, and the link it brings with it', () => {
  it('a bare word offers the component with its closing tag, and Emmet is still there', async () => {
    const items = await completeAt(
      SLUG,
      `${ROUTE_HEAD}<link rel="component" href="../components/app-badge.fud">\n<article>\n  app|\n</article>\n`,
    );
    const badge = items.find((item) => item.label === 'app-badge');

    expect(badge?.sortText).toBe('0_app-badge');
    expect(badge?.textEdit?.newText).toBe('<app-badge>$0</app-badge>');
    expect(badge?.additionalTextEdits).toBeUndefined();
    // Criterion 11 over the wire: the abbreviation is in the same answer.
    expect(labels(items)).toContain('applet');
  });

  it('an unlinked component brings its <link>, and what lands compiles', async () => {
    const source = `${ROUTE_HEAD}<article>\n  site|\n</article>\n`;
    const items = await completeAt(SLUG, source);
    const nav = items.find((item) => item.label === 'site-nav');
    const edit = nav?.additionalTextEdits?.[0];

    expect(nav?.sortText).toBe('1_site-nav');
    expect(nav?.labelDetails?.description).toBe('fudic component · adds <link>');
    expect(edit?.newText).toBe('\n<link rel="component" href="../components/site-nav.fud">');

    // The edits the editor would apply, applied — the item's own and the one it carries —
    // and then the server asked what it thinks of the result. Anything less than this is a
    // test of an item, not of a feature.
    const { text } = harness.cursor(source);
    const applied = applyEdits(text, [
      { ...(nav?.textEdit as TextEdit), newText: '<site-nav>$0</site-nav>' },
      edit as TextEdit,
    ]).replace('$0', '');

    expect(applied).toContain('<link rel="component" href="../components/site-nav.fud">');
    expect(applied).toContain('<site-nav></site-nav>');

    const { uri } = await harness.open(SLUG);
    await harness.change(uri, applied, ++version);
    const report = (await harness.client.sendRequest(DocumentDiagnosticRequest.type, {
      textDocument: { uri },
    })) as FullDocumentDiagnosticReport;

    // No FUD0191 (a tag with no link) and no FUD0460 (a link that resolves nowhere): the
    // component and its declaration landed together.
    expect(report.items.filter((item) => (item.severity ?? 1) <= 2)).toEqual([]);
  });
});
