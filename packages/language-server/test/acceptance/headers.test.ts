/**
 * SDD-84 criterion 33 through a live server: a `page.headers` opened as the editor names it is
 * validated under its project's policy, says what the last build left in `.fudic/csp-needs.json`,
 * completes, hovers and offers its bulbs — the project's `fudic.json` among them.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CodeActionRequest,
  CompletionRequest,
  DocumentDiagnosticRequest,
  HoverRequest,
  type CodeAction,
  type CompletionList,
  type FullDocumentDiagnosticReport,
  type Hover,
} from 'vscode-languageserver-protocol/node';
import { copyWorkspace, startHarness, type Harness } from './_harness.js';

let harness: Harness;
let root: string;

const STRICT = "  object-src 'none'\n  base-uri 'none'\n  frame-ancestors 'none'\n";
const TEXT = `Content-Security-Policy:\n  script-src 'self'\n${STRICT}Referrer-Policy: origin\n`;

beforeAll(async () => {
  root = copyWorkspace();
  mkdirSync(`${root}/app/.fudic`, { recursive: true });
  writeFileSync(`${root}/app/fudic.json`, JSON.stringify({ id: 'app', diagnostics: { FUD1549: 'error' } }));
  writeFileSync(`${root}/app/sw.json`, JSON.stringify({ shell: [] }));
  writeFileSync(`${root}/app/.fudic/csp-needs.json`, JSON.stringify({ 'page.headers': [{ loads: 'inline-script', piece: 'the style polyfill' }] }));
  writeFileSync(`${root}/app/page.headers`, TEXT);
  harness = await startHarness({ root });
}, 60_000);

afterAll(async () => {
  await harness.stop();
});

describe('a page.headers in the editor (criterion 33)', () => {
  it('what the reader and the build say, under the policy of its project', async () => {
    const { uri } = await harness.open('app/page.headers', TEXT, 'fudheaders');
    const report = (await harness.client.sendRequest(DocumentDiagnosticRequest.type, { textDocument: { uri } })) as FullDocumentDiagnosticReport;
    expect(report.items.map((d) => [d.code, d.severity, d.range.start.line])).toEqual([
      ['FUD1545', 1, 1],
      ['FUD1549', 1, 5],
    ]);
  });

  it('its bulbs: the source the piece needs, and the project where a code is turned off', async () => {
    const uri = harness.uriOf('app/page.headers');
    const at = { start: { line: 1, character: 2 }, end: { line: 1, character: 12 } };
    const actions = (await harness.client.sendRequest(CodeActionRequest.type, { textDocument: { uri }, range: at, context: { diagnostics: [] } })) as CodeAction[];
    expect(actions.map((a) => a.title)).toContain("Add 'nonce-{nonce}'");
    const referrer = { start: { line: 5, character: 17 }, end: { line: 5, character: 23 } };
    const more = (await harness.client.sendRequest(CodeActionRequest.type, { textDocument: { uri }, range: referrer, context: { diagnostics: [] } })) as CodeAction[];
    expect(more.map((a) => a.title)).toContain('Silence FUD1549 on this line');
  });

  it('completes and hovers', async () => {
    const uri = harness.uriOf('app/page.headers');
    const list = (await harness.client.sendRequest(CompletionRequest.type, { textDocument: { uri }, position: { line: 1, character: 8 } })) as CompletionList;
    expect(list.items.map((i) => i.label)).toContain('script-src-elem');
    const hover = (await harness.client.sendRequest(HoverRequest.type, { textDocument: { uri }, position: { line: 5, character: 3 } })) as Hover;
    expect((hover.contents as { value: string }).value).toContain('**Referrer-Policy**');
  });
});
