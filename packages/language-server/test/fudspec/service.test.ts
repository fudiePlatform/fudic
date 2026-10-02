/**
 * SDD-52 criteria 21 and 24 — the `.fudspec` service as Volar calls it: it answers in a
 * `.fudspec`, whether Volar hands over the file or its root code, and nowhere else.
 */

import { describe, expect, it } from 'vitest';
import type { LanguageServicePluginInstance } from '@volar/language-service';
import { CancellationToken, type Diagnostic, type Hover } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { docsUrl } from '@fudic/diagnostics';
import { SEMANTIC_TOKENS_LEGEND } from '../../src/capabilities.js';
import { createFudspecService } from '../../src/fudspec/service.js';
import { RequestStats } from '../../src/stats.js';
import { fakeServiceContext } from '../_lsp.js';
import { FILES, ROOT, SPEC_PATH, WS_TERMS, world } from './_spec.js';

const SPEC_URI = URI.file(SPEC_PATH);
/** What Volar hands a service: the root code under an embedded URI. */
const EMBEDDED = URI.parse(`volar-embedded-content://root/${encodeURIComponent(SPEC_URI.toString())}`);

const NONE = CancellationToken.None;

function service(files = FILES): LanguageServicePluginInstance {
  const { host } = world({ files });
  const decode = (uri: URI): [URI, string] | undefined =>
    uri.toString() === EMBEDDED.toString() ? [SPEC_URI, 'root'] : undefined;
  return createFudspecService({ host, stats: new RequestStats() }).create(fakeServiceContext({}, decode));
}

const doc = (text: string, uri: URI = EMBEDDED): TextDocument => TextDocument.create(uri.toString(), 'fudspec', 1, text);

async function diagnostics(text: string, files = FILES): Promise<Diagnostic[]> {
  return ((await service(files).provideDiagnostics?.(doc(text), NONE)) ?? []) as Diagnostic[];
}

describe('diagnostics (criterion 21)', () => {
  it('publishes the parser’s and the validator’s, as LSP', async () => {
    const found = await diagnostics('component fud-button\ncriterion a\n  then\n    nope\n  thn\n');
    // The parser's first, then the validator's.
    expect(found.map((d) => d.code)).toEqual(['FUD0929', 'FUD0940']);
    expect(found[1]).toEqual({
      range: { start: { line: 3, character: 4 }, end: { line: 3, character: 8 } },
      severity: 1,
      code: 'FUD0940',
      codeDescription: { href: docsUrl('FUD0940') },
      source: 'fudic',
      message: expect.stringContaining('`then` terms: [min-height, visible]'),
    });
  });

  it('is empty for a sound file', async () => {
    const text = 'component fud-card\ncriterion a\n  given\n    props vacio\n  then\n    min-height fud-card 44\n';
    expect(await diagnostics(text)).toEqual([]);
  });

  it('points related locations into this file when they carry none', async () => {
    const [d] = await diagnostics('component fud-card\ncomponent fud-button\ncriterion a\n  then\n    visible x\n');
    expect(d?.code).toBe('FUD0923');
    expect(d?.relatedInformation).toEqual([
      {
        location: { uri: SPEC_URI.toString(), range: { start: { line: 0, character: 0 }, end: { line: 0, character: 18 } } },
        message: 'declared here',
      },
    ]);
  });

  it('points a broken module’s problem into the module', async () => {
    const path = `${WS_TERMS}/then/broken.js`;
    const module = "export const meta = { name: 'other', block: 'then', params: [] };\nexport function run() {}\nexport const selfTest = [];";
    const [d] = await diagnostics('component fud-button\ncriterion a\n  then\n    broken\n',{ ...FILES, [path]: module });
    expect(d?.code).toBe('FUD0942');
    expect(d?.relatedInformation).toEqual([
      {
        location: { uri: URI.file(path).toString(), range: { start: { line: 0, character: 28 }, end: { line: 0, character: 35 } } },
        message: 'in the term module',
      },
    ]);
  });

  it('points at the top of a module it cannot read', async () => {
    const path = `${WS_TERMS}/then/gone.js`;
    const [d] = await diagnostics('component fud-button\ncriterion a\n  then\n    gone\n',{ ...FILES, [path]: undefined });
    expect(d?.code).toBe('FUD0941');
    expect(d?.relatedInformation?.[0]?.location.range).toEqual({ start: { line: 0, character: 0 }, end: { line: 0, character: 0 } });
  });
});

describe('the other requests', () => {
  const TEXT = 'component fud-card\ncriterion a\n  then\n    min-height fud-card 44\n    nope\n';
  const at = (needle: string) => doc(TEXT).positionAt(TEXT.indexOf(needle) + 1);

  it('completes, hovers and goes to the definition', async () => {
    const s = service();
    const list = await s.provideCompletionItems?.(doc(TEXT), { line: 3, character: 4 }, { triggerKind: 1 }, NONE);
    expect(list?.items.map((i) => i.label)).toEqual(['min-height', 'visible']);
    const hover = (await s.provideHover?.(doc(TEXT), at('min-height'), NONE)) as Hover;
    expect((hover.contents as { value: string }).value).toContain('min-height target:element px:number');
    const definition = await s.provideDefinition?.(doc(TEXT), at('min-height'), NONE);
    expect(definition).toMatchObject([{ targetUri: URI.file(`${WS_TERMS}/then/min-height.js`).toString() }]);
  });

  it('encodes the semantic tokens against the legend', async () => {
    const tokens = await service().provideDocumentSemanticTokens?.(doc(TEXT), { start: { line: 0, character: 0 }, end: { line: 9, character: 0 } }, SEMANTIC_TOKENS_LEGEND, NONE);
    const { tokenTypes, tokenModifiers } = SEMANTIC_TOKENS_LEGEND;
    expect(tokens).toEqual([
      [3, 4, 10, tokenTypes.indexOf('function'), 0],
      [3, 15, 8, tokenTypes.indexOf('fudComponentTag'), 0],
      [4, 4, 4, tokenTypes.indexOf('function'), 1 << tokenModifiers.indexOf('deprecated')],
    ]);
  });

  it('takes the .fudspec URI itself as well as its root code', async () => {
    const list = await service().provideCompletionItems?.(doc('', SPEC_URI), { line: 0, character: 0 }, { triggerKind: 1 }, NONE);
    expect(list?.items.map((i) => i.label)).toEqual(['component', 'criterion']);
  });
});

describe('isolation (criterion 24)', () => {
  it('answers nothing in a document that is not a .fudspec', async () => {
    const s = service();
    const fud = doc('component fud-card\n', URI.file(`${ROOT}/components/fud-card.fud`));
    const zero = { line: 0, character: 0 };
    expect(await s.provideDiagnostics?.(fud, NONE)).toBeUndefined();
    expect(await s.provideCompletionItems?.(fud, zero, { triggerKind: 1 }, NONE)).toBeUndefined();
    expect(await s.provideHover?.(fud, zero, NONE)).toBeUndefined();
    expect(await s.provideDefinition?.(fud, zero, NONE)).toBeUndefined();
    expect(await s.provideDocumentSemanticTokens?.(fud, { start: zero, end: zero }, SEMANTIC_TOKENS_LEGEND, NONE)).toBeUndefined();
  });
});
