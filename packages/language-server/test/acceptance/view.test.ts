/**
 * SDD-51 criterion 19: what the view may not write is marked in the editor, over the live LSP
 * connection, on the same span the build fails on (the channel of SDD-35).
 *
 * One mutant per code of the range, on the blog post of the fixture project: the line that
 * reads `<h1>@data.title</h1>` rewritten into each fault. TypeScript may add its own voice on
 * some of them — a write to `data`, `this` in a module — and that is its business: what is
 * asserted is that the FUD code is there, and where it points.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DocumentDiagnosticRequest,
  type Diagnostic,
  type FullDocumentDiagnosticReport,
} from 'vscode-languageserver-protocol/node';
import { startHarness, type Harness } from './_harness.js';

const SLUG = 'blog/[slug].fud';
const LINE = '<h1>@data.title</h1>';

let harness: Harness;
let version = 1;
let uri: string;
let slug: string;

async function diagnosticsOf(text: string): Promise<Diagnostic[]> {
  await harness.change(uri, text, ++version);
  const report = (await harness.client.sendRequest(DocumentDiagnosticRequest.type, {
    textDocument: { uri },
  })) as FullDocumentDiagnosticReport;
  return report.items;
}

const textAt = (source: string, diagnostic: Diagnostic): string => {
  const { start, end } = diagnostic.range;
  return (source.split('\n')[start.line] ?? '').slice(start.character, end.character);
};

beforeAll(async () => {
  harness = await startHarness();
  const opened = await harness.open(SLUG);
  uri = opened.uri;
  slug = opened.text;
}, 60_000);

afterAll(async () => {
  await harness.stop();
});

describe('SDD-51 — every code of the view, in the editor', () => {
  it.each([
    ['FUD0900', "<h1>@(data.title = 'x')</h1>", "data.title = 'x'"],
    ['FUD0901', '@{ data = null; }', 'data'],
    ['FUD0902', '<h1>@(await data)</h1>', 'await data'],
    ['FUD0903', '<h1>@(import.meta.url)</h1>', 'import.meta'],
    ['FUD0904', '<h1>@(String(this))</h1>', 'this'],
    ['FUD0905', '<h1>@((() => { return 1; })())</h1>', '() => { return 1; }'],
    ['FUD0906', '<h1>@((1, data.title))</h1>', '1, data.title'],
    ['FUD0907', '<h1>@(window.name)</h1>', 'window'],
    ['FUD0908', '@{ debugger; }', 'debugger'],
    ['FUD0909', '<h1 onclick="x">x</h1>', 'onclick'],
    ['FUD0910', '<h1>@(data.constructor.name)</h1>', 'constructor'],
    ['FUD0912', '<h1>@(Math.random())</h1>', 'Math.random()'],
    ['FUD0919', '<h1>@(/x/.source)</h1>', '/x/'],
  ])('%s on %j', async (code, line, text) => {
    const source = slug.replace(LINE, line);
    const found = (await diagnosticsOf(source)).find((d) => d.code === code);
    expect(found).toBeDefined();
    expect(textAt(source, found!)).toBe(text);
  });
});
