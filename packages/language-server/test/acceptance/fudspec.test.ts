/**
 * SDD-52 §6, criteria 21–25 — a `.fudspec` in a live server, over a real workspace on disk.
 *
 * The workspace is a private copy, because criterion 25 deletes a term module from it. The
 * framework layer is a folder of its own, injected the way the extension will inject it.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CompletionRequest,
  DefinitionRequest,
  DidChangeWatchedFilesNotification,
  DocumentDiagnosticRequest,
  FileChangeType,
  HoverRequest,
  SemanticTokensRequest,
  type CompletionItem,
  type CompletionList,
  type FullDocumentDiagnosticReport,
  type Hover,
  type Location,
} from 'vscode-languageserver-protocol/node';
import { URI } from 'vscode-uri';
import { toPosix } from '@fudic/typecheck';
import { copyWorkspace, startHarness, type Harness } from './_harness.js';

const SPEC = 'components/app-badge.fudspec';

const term = (name: string, block: string, params: string, describe = ''): string =>
  [
    `export const meta = { name: '${name}', block: '${block}', params: [${params}]${describe} };`,
    'export async function run(ctx) {}',
    'export const selfTest = [];',
  ].join('\n');

const ELEMENT = "{ name: 'target', type: 'element' }";

let harness: Harness;
let root: string;
let framework: string;
let version = 1;

beforeAll(async () => {
  root = copyWorkspace();
  mkdirSync(`${root}/fudic/terms/then`, { recursive: true });
  writeFileSync(
    `${root}/fudic/terms/then/min-height.js`,
    term('min-height', 'then', `${ELEMENT}, { name: 'px', type: 'number' }`, ", describe: ({ px }) => `${px}px`"),
  );
  writeFileSync(`${root}/components/app-badge.fixture.ts`, "export default { 'tono-alto': { tone: 'info' } };\n");

  framework = toPosix(mkdtempSync(join(tmpdir(), 'fudic-terms-')));
  mkdirSync(`${framework}/then`);
  writeFileSync(`${framework}/then/visible.js`, term('visible', 'then', ELEMENT));

  harness = await startHarness({ root, overrides: { frameworkTerms: framework } });
}, 60_000);

afterAll(async () => {
  await harness.stop();
  rmSync(framework, { recursive: true, force: true });
});

async function diagnosticsOf(text: string): Promise<string[]> {
  const uri = harness.uriOf(SPEC);
  if (version === 1) await harness.open(SPEC, text, 'fudspec');
  else await harness.change(uri, text, version);
  version++;
  const report = (await harness.client.sendRequest(DocumentDiagnosticRequest.type, {
    textDocument: { uri },
  })) as FullDocumentDiagnosticReport;
  // Sorted: the order Volar merges the providers in is not part of any criterion.
  return report.items.map((d) => `${d.code}@${d.range.start.line}`).sort();
}

const SOUND = [
  'component app-badge',
  'criterion alto',
  '  given',
  '    props tono-alto',
  '  then',
  '    min-height app-badge 44',
  '    visible role:status',
  '',
].join('\n');

describe('criterion 21 — live diagnostics', () => {
  it('publishes the parser’s and the validator’s, and retires them once fixed', async () => {
    const broken = SOUND.replace('min-height app-badge 44', 'max-height app-badge 44').replace('  given', '  givn');
    expect(await diagnosticsOf(broken)).toEqual(['FUD0929@2', 'FUD0940@5']);
    expect(await diagnosticsOf(SOUND)).toEqual([]);
  });
});

/** The position of `needle` in the sound file, `delta` characters in. */
const at = (needle: string, delta = 0) => harness.positionAt(SOUND, SOUND.indexOf(needle) + delta);

describe('criterion 22 — completion', () => {
  const complete = async (text: string): Promise<CompletionItem[]> => {
    const { text: source, position } = harness.cursor(text);
    await diagnosticsOf(source);
    const result = await harness.client.sendRequest(CompletionRequest.type, {
      textDocument: { uri: harness.uriOf(SPEC) },
      position,
    });
    return result === null ? [] : Array.isArray(result) ? result : (result as CompletionList).items;
  };

  it('offers the then terms of both layers, once, with the layer', async () => {
    const items = await complete('component app-badge\ncriterion a\n  then\n    |');
    expect(items.map((i) => [i.label, i.labelDetails?.description])).toEqual([
      ['min-height', 'workspace'],
      ['visible', 'framework'],
    ]);
  });

  it('offers the workspace tags and role: after an element term', async () => {
    const items = await complete('component app-badge\ncriterion a\n  then\n    visible |');
    expect(items.map((i) => i.label)).toEqual(['app-badge', 'site-nav', 'role:']);
  });

  it('offers the fixture keys after props', async () => {
    const items = await complete('component app-badge\ncriterion a\n  given\n    props |');
    expect(items.map((i) => i.label)).toEqual(['tono-alto']);
  });
});

describe('criterion 23 — hover and definition', () => {
  it('shows the signature, describe, layer and path of a term', async () => {
    await diagnosticsOf(SOUND);
    const hover = (await harness.client.sendRequest(HoverRequest.type, {
      textDocument: { uri: harness.uriOf(SPEC) },
      position: at('min-height', 2),
    })) as Hover;
    const value = (hover.contents as { value: string }).value;
    expect(value).toContain('min-height target:element px:number');
    expect(value).toContain('({ px }) => `${px}px`');
    expect(value).toContain(`workspace · \`${root}/fudic/terms/then/min-height.js\``);
  });

  it('goes to the .js that won', async () => {
    // The harness declares no `linkSupport`, so Volar answers with plain locations.
    const links = (await harness.client.sendRequest(DefinitionRequest.type, {
      textDocument: { uri: harness.uriOf(SPEC) },
      position: at('visible', 2),
    })) as Location[];
    expect(links.map((l) => toPosix(URI.parse(l.uri).fsPath))).toEqual([`${framework}/then/visible.js`]);
  });
});

describe('criterion 24 — isolation', () => {
  it('lets no service of the .fud answer in a .fudspec', async () => {
    await diagnosticsOf(SOUND);
    const uri = harness.uriOf(SPEC);
    // Places where the .fudspec service has nothing to say: whatever answered would be HTML,
    // CSS, TypeScript or the .fud's own services speaking in a file that is not theirs.
    for (const needle of ['criterion', '44', 'role:status', 'given']) {
      const hover = await harness.client.sendRequest(HoverRequest.type, { textDocument: { uri }, position: at(needle, 1) });
      expect(hover, needle).toBeNull();
      const definition = await harness.client.sendRequest(DefinitionRequest.type, { textDocument: { uri }, position: at(needle, 1) });
      expect(definition === null || (Array.isArray(definition) && definition.length === 0), needle).toBe(true);
    }
    const completion = await harness.client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: at('44', 2),
    });
    const items = completion === null ? [] : Array.isArray(completion) ? completion : completion.items;
    expect(items).toEqual([]);
  });

  it('paints only its own semantic tokens', async () => {
    await diagnosticsOf(SOUND);
    const tokens = await harness.client.sendRequest(SemanticTokensRequest.type, {
      textDocument: { uri: harness.uriOf(SPEC) },
    });
    // min-height, its app-badge argument, and visible: five numbers each.
    expect(tokens?.data.length).toBe(15);
  });
});

describe('criterion 25 — invalidation', () => {
  it('turns the line into FUD0940 when its module is deleted, without reopening', async () => {
    expect(await diagnosticsOf(SOUND)).toEqual([]);
    const module = `${root}/fudic/terms/then/min-height.js`;
    rmSync(module);
    await harness.client.sendNotification(DidChangeWatchedFilesNotification.type, {
      changes: [{ uri: URI.file(module).toString(), type: FileChangeType.Deleted }],
    });
    expect(await diagnosticsOf(SOUND)).toEqual(['FUD0940@5']);
  });
});
