/**
 * SDD-60 criteria 27 (the `.fudapi` side) and 31 — the `.fudapi` service as Volar calls it: it
 * answers in a `.fudapi`, whether Volar hands over the file or its root code, and nowhere else;
 * and nothing of the `.fud` or the `.fudspec` answers in it.
 */

import { describe, expect, it } from 'vitest';
import { formatApi } from '@fudic/api';
import { docsUrl } from '@fudic/diagnostics';
import type { LanguageServicePluginInstance } from '@volar/language-service';
import { CancellationToken, type Diagnostic, type Hover } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { SEMANTIC_TOKENS_LEGEND } from '../../src/capabilities.js';
import { DocumentCache } from '../../src/document-cache.js';
import { createFudapiLanguagePlugin, FUDAPI_LANGUAGE_ID } from '../../src/fudapi/language-plugin.js';
import { createFudapiService } from '../../src/fudapi/service.js';
import { createFudspecLanguagePlugin } from '../../src/fudspec/language-plugin.js';
import { createFudspecService } from '../../src/fudspec/service.js';
import { SpecHost } from '../../src/fudspec/host.js';
import { createFudicLanguagePlugin } from '../../src/language-plugin.js';
import { RequestStats } from '../../src/stats.js';
import { isFudapiUri } from '../../src/uri.js';
import { WorkspaceIndex } from '../../src/workspace-index.js';
import { fakeServiceContext } from '../_lsp.js';
import { memoryFs } from '../_support.js';
import { FILES, SRC, world } from './_api.js';

const PATH = `${SRC}/routes/usuarios.fudapi`;
const API_URI = URI.file(PATH);
/** What Volar hands a service: the root code under an embedded URI. */
const EMBEDDED = URI.parse(`volar-embedded-content://root/${encodeURIComponent(API_URI.toString())}`);
const FUD_URI = URI.file(`${SRC}/routes/usuarios.fud`);

const NONE = CancellationToken.None;
const ZERO = { line: 0, character: 0 };
const WHOLE = { start: ZERO, end: { line: 99, character: 0 } };

function service(files = FILES, open: Readonly<Record<string, string>> = {}): LanguageServicePluginInstance {
  const { host } = world({ files, open });
  const decode = (uri: URI): [URI, string] | undefined => (uri.toString() === EMBEDDED.toString() ? [API_URI, 'root'] : undefined);
  return createFudapiService({ host, stats: new RequestStats() }).create(fakeServiceContext({}, decode));
}

const doc = (text: string, uri: URI = EMBEDDED): TextDocument => TextDocument.create(uri.toString(), 'fudapi', 1, text);

async function diagnostics(text: string, s = service()): Promise<Diagnostic[]> {
  return ((await s.provideDiagnostics?.(doc(text), NONE)) ?? []) as Diagnostic[];
}

describe('live diagnostics (criterion 27)', () => {
  it('publishes the parser’s and the validator’s, as LSP', async () => {
    const found = await diagnostics('ge search\nget f\n  -> Persn\n');
    expect(found.map((d) => d.code)).toEqual(['FUD1062', 'FUD1080']);
    expect(found[1]).toEqual({
      range: { start: { line: 2, character: 5 }, end: { line: 2, character: 10 } },
      severity: 1,
      code: 'FUD1080',
      codeDescription: { href: docsUrl('FUD1080') },
      source: 'fudic',
      message: expect.stringContaining('`Person`'),
    });
  });

  it('is empty for a sound route contract', async () => {
    expect(await diagnostics('load ssr\n  users  Person[]\nput save\n  use auth\n  id  i32\n')).toEqual([]);
  });

  it('correcting the line takes the diagnostic away', async () => {
    const s = service();
    expect((await diagnostics('get f\n  -> Persn\n', s)).map((d) => d.code)).toEqual(['FUD1080']);
    expect(await diagnostics('get f\n  -> Person\n', s)).toEqual([]);
  });

  it('knows a route sibling: `paths` in a route without parameters', async () => {
    expect((await diagnostics('paths\n')).map((d) => d.code)).toEqual(['FUD1091']);
  });

  it('points a related location into this file or into another', async () => {
    const [same] = await diagnostics('get f\nget f\n');
    expect(same?.relatedInformation).toEqual([
      { location: { uri: API_URI.toString(), range: { start: { line: 0, character: 4 }, end: { line: 0, character: 5 } } }, message: 'first here' },
    ]);
    const [other] = await diagnostics('type Person\n  x  str\n');
    expect(other?.code).toBe('FUD1081');
    expect(other?.relatedInformation).toEqual([
      {
        location: { uri: URI.file(`${SRC}/types/person.fudapi`).toString(), range: { start: { line: 0, character: 5 }, end: { line: 0, character: 11 } } },
        message: 'declared here',
      },
    ]);
  });

  it('a related file that cannot be read points at its top', async () => {
    const [d] = await diagnostics('type Person\n  x  str\n', service({ ...FILES, [`${SRC}/types/person.fudapi`]: undefined }));
    // Unreadable, the other file declares nothing: no clash at all.
    expect(d).toBeUndefined();
    const gone = { ...FILES, [`${SRC}/types/other.fudapi`]: 'type Clash\n  x  str\n' };
    const { host } = world({ files: gone });
    host.load(PATH, '');
    const readless = { ...host, read: () => undefined, load: host.load.bind(host) } as unknown as typeof host;
    const decode = (uri: URI): [URI, string] | undefined => (uri.toString() === EMBEDDED.toString() ? [API_URI, 'root'] : undefined);
    const s = createFudapiService({ host: readless, stats: new RequestStats() }).create(fakeServiceContext({}, decode));
    const [clash] = (await s.provideDiagnostics?.(doc('type Clash\n  y  str\n'), NONE)) as Diagnostic[];
    expect(clash?.relatedInformation?.[0]?.location.range).toEqual({ start: ZERO, end: ZERO });
  });

  it('an open .fudapi speaks with its unsaved text to the one that uses it', async () => {
    const open = { [`${SRC}/middlewares/auth.fudapi`]: 'middleware authz\n  server\n' };
    const found = await diagnostics('get f\n  use auth\n', service(FILES, open));
    expect(found.map((d) => [d.code, d.message])).toEqual([['FUD1080', expect.stringContaining('`authz`')]]);
  });
});

describe('the other requests', () => {
  const TEXT = 'put save\n  use auth\n  -> Person\n';

  it('completes, hovers and goes to the definition', async () => {
    const s = service();
    const list = await s.provideCompletionItems?.(doc(TEXT), { line: 1, character: 2 }, { triggerKind: 1 }, NONE);
    expect(list?.items.map((i) => i.label)).toContain('invalidates');
    const hover = (await s.provideHover?.(doc(TEXT), { line: 1, character: 8 }, NONE)) as Hover;
    expect((hover.contents as { value: string }).value).toContain('middleware auth');
    const definition = await s.provideDefinition?.(doc(TEXT), { line: 2, character: 6 }, NONE);
    expect(definition).toMatchObject([{ targetUri: URI.file(`${SRC}/types/person.fudapi`).toString() }]);
  });

  it('encodes the semantic tokens against the legend', async () => {
    const tokens = await service().provideDocumentSemanticTokens?.(doc('get f\n  use csrf nope\n'), WHOLE, SEMANTIC_TOKENS_LEGEND, NONE);
    const { tokenTypes, tokenModifiers } = SEMANTIC_TOKENS_LEGEND;
    expect(tokens).toEqual([
      [0, 0, 3, tokenTypes.indexOf('keyword'), 0],
      [1, 6, 4, tokenTypes.indexOf('function'), 1 << tokenModifiers.indexOf('defaultLibrary')],
      [1, 11, 4, tokenTypes.indexOf('function'), 1 << tokenModifiers.indexOf('deprecated')],
    ]);
  });

  it('formats with one edit of the whole document, the text formatApi gives', async () => {
    const messy = 'type A\n   x str\n\n\n';
    const edits = await service().provideDocumentFormattingEdits?.(doc(messy), WHOLE, { tabSize: 2, insertSpaces: true }, undefined as never, NONE);
    expect(edits).toEqual([{ range: { start: ZERO, end: { line: 4, character: 0 } }, newText: formatApi(messy) }]);
  });

  it('formats to no edit when the file is formatted or has an unclosed quote', async () => {
    const options = { tabSize: 2, insertSpaces: true };
    const s = service();
    expect(await s.provideDocumentFormattingEdits?.(doc('type A\n  x  str\n'), WHOLE, options, undefined as never, NONE)).toEqual([]);
    expect(await s.provideDocumentFormattingEdits?.(doc('messages\n  x   "open\n'), WHOLE, options, undefined as never, NONE)).toEqual([]);
  });

  it('takes the .fudapi URI itself as well as its root code', async () => {
    const list = await service().provideCompletionItems?.(doc('', API_URI), ZERO, { triggerKind: 1 }, NONE);
    expect(list?.items.map((i) => i.label)).toContain('middleware');
  });

  it('declares its triggers and its capabilities', () => {
    const plugin = createFudapiService({ host: world().host, stats: new RequestStats() });
    expect(plugin.capabilities.completionProvider?.triggerCharacters).toEqual(['{', ' ']);
    expect(plugin.capabilities.diagnosticProvider).toEqual({ interFileDependencies: true, workspaceDiagnostics: false });
  });
});

describe('isolation (criterion 31)', () => {
  it('the .fudapi service answers nothing in a document that is not a .fudapi', async () => {
    const s = service();
    for (const uri of [FUD_URI, URI.file(`${SRC}/components/x.fudspec`)]) {
      const other = doc('get f\n', uri);
      expect(await s.provideDiagnostics?.(other, NONE)).toBeUndefined();
      expect(await s.provideCompletionItems?.(other, ZERO, { triggerKind: 1 }, NONE)).toBeUndefined();
      expect(await s.provideHover?.(other, ZERO, NONE)).toBeUndefined();
      expect(await s.provideDefinition?.(other, ZERO, NONE)).toBeUndefined();
      expect(await s.provideDocumentSemanticTokens?.(other, WHOLE, SEMANTIC_TOKENS_LEGEND, NONE)).toBeUndefined();
      expect(await s.provideDocumentFormattingEdits?.(other, WHOLE, { tabSize: 2, insertSpaces: true }, undefined as never, NONE)).toBeUndefined();
    }
  });

  it('the .fudspec service answers nothing in a .fudapi', async () => {
    const index = new WorkspaceIndex(memoryFs({}));
    const host = new SpecHost({ index, fs: { readDirectory: () => [], readFile: () => undefined }, roots: () => ['/ws'] });
    const s = createFudspecService({ host, stats: new RequestStats() }).create(fakeServiceContext({}));
    const api = doc('get f\n', API_URI);
    expect(await s.provideDiagnostics?.(api, NONE)).toBeUndefined();
    expect(await s.provideCompletionItems?.(api, ZERO, { triggerKind: 1 }, NONE)).toBeUndefined();
    expect(await s.provideHover?.(api, ZERO, NONE)).toBeUndefined();
  });

  it('neither the .fud nor the .fudspec language claims a .fudapi', () => {
    const fudic = createFudicLanguagePlugin(new DocumentCache(new WorkspaceIndex(memoryFs({}))));
    expect(fudic.getLanguageId(API_URI)).toBeUndefined();
    expect(createFudspecLanguagePlugin().getLanguageId(API_URI)).toBeUndefined();
  });
});

describe('the .fudapi language plugin (criterion 31)', () => {
  const plugin = createFudapiLanguagePlugin();
  const snapshot = { getText: () => 'get f', getLength: () => 5, getChangeRange: () => undefined };

  it('claims only .fudapi', () => {
    expect(isFudapiUri(API_URI)).toBe(true);
    expect(isFudapiUri(FUD_URI)).toBe(false);
    expect(plugin.getLanguageId(API_URI)).toBe(FUDAPI_LANGUAGE_ID);
    expect(plugin.getLanguageId(FUD_URI)).toBeUndefined();
  });

  it('makes one root code mapped whole, with nothing embedded', () => {
    const code = plugin.createVirtualCode?.(API_URI, 'plaintext', snapshot, {} as never);
    expect(code).toMatchObject({ id: 'root', languageId: 'fudapi', snapshot });
    expect(code?.embeddedCodes).toBeUndefined();
    expect(code?.mappings).toEqual([
      { sourceOffsets: [0], generatedOffsets: [0], lengths: [5], data: expect.objectContaining({ format: true, completion: true }) },
    ]);
  });

  it('takes the editor languageId too, and nothing else', () => {
    const untitled = URI.parse('untitled:Untitled-1');
    expect(plugin.createVirtualCode?.(untitled, 'fudapi', snapshot, {} as never)?.id).toBe('root');
    expect(plugin.createVirtualCode?.(FUD_URI, 'fudic', snapshot, {} as never)).toBeUndefined();
  });

  it('rebuilds the code on update', () => {
    const next = { ...snapshot, getLength: () => 3 };
    expect(plugin.updateVirtualCode?.(API_URI, {} as never, next, {} as never)?.mappings[0]?.lengths).toEqual([3]);
  });
});
