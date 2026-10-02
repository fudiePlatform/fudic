/**
 * SDD-53 §6, criteria 14–18 and 23 — writing a `.fudspec` in a live server, over a real workspace
 * on disk with its TypeScript program: what the editor is offered once Volar has merged every
 * service, which is where an item of ours could be swallowed (SDD-28).
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CodeActionRequest,
  CompletionRequest,
  DocumentDiagnosticRequest,
  DocumentFormattingRequest,
  type CodeAction,
  type CompletionItem,
  type CompletionList,
  type FullDocumentDiagnosticReport,
  type TextEdit,
} from 'vscode-languageserver-protocol/node';
import { URI } from 'vscode-uri';
import { fixtureModule, formatSpec, termModule } from '@fudic/spec';
import { toPosix } from '@fudic/typecheck';
import { copyWorkspace, startHarness, type Harness } from './_harness.js';

const SPEC = 'components/app-probe.fudspec';

const PROBE = `@code {
  const { label, tone, items, extra } = props<{ label: string; tone: 'info' | 'warn'; items: { id: number }[]; extra?: string }>();
}

<app-probe>
  <template shadowrootmode="open">
    <span>@label</span>
  </template>
</app-probe>
`;

let harness: Harness;
let root: string;
let framework: string;
let version = 1;

beforeAll(async () => {
  root = copyWorkspace();
  // The project the workspace terms belong to.
  writeFileSync(`${root}/fudic.json`, JSON.stringify({ id: 'probe', kind: 'app', prefix: 'app' }));
  writeFileSync(`${root}/components/app-probe.fud`, PROBE);

  framework = toPosix(mkdtempSync(join(tmpdir(), 'fudic-terms-')));
  mkdirSync(`${framework}/then`);
  writeFileSync(`${framework}/then/visible.js`, termModule('then', 'visible', [{ name: 'target', type: 'element' }]));

  harness = await startHarness({ root, overrides: { frameworkTerms: framework } });
}, 60_000);

afterAll(async () => {
  await harness.stop();
  rmSync(framework, { recursive: true, force: true });
});

/** Open or change the `.fudspec` to `text`, and return its diagnostics as published. */
async function show(text: string): Promise<FullDocumentDiagnosticReport['items']> {
  const uri = harness.uriOf(SPEC);
  if (version === 1) await harness.open(SPEC, text, 'fudspec');
  else await harness.change(uri, text, version);
  version++;
  const report = (await harness.client.sendRequest(DocumentDiagnosticRequest.type, {
    textDocument: { uri },
  })) as FullDocumentDiagnosticReport;
  return report.items;
}

async function complete(marked: string): Promise<CompletionItem[]> {
  const { text, position } = harness.cursor(marked);
  await show(text);
  const result = await harness.client.sendRequest(CompletionRequest.type, {
    textDocument: { uri: harness.uriOf(SPEC) },
    position,
  });
  return result === null ? [] : Array.isArray(result) ? result : (result as CompletionList).items;
}

async function bulb(text: string): Promise<CodeAction[]> {
  const diagnostics = await show(text);
  const got = await harness.client.sendRequest(CodeActionRequest.type, {
    textDocument: { uri: harness.uriOf(SPEC) },
    range: { start: { line: 0, character: 0 }, end: harness.positionAt(text, text.length) },
    context: { diagnostics },
  });
  return (got ?? []) as CodeAction[];
}

describe('the server declares the light bulb and formatting', () => {
  it('advertises both capabilities', () => {
    expect(harness.capabilities.capabilities.codeActionProvider).toBeTruthy();
    expect(harness.capabilities.capabilities.documentFormattingProvider).toBeTruthy();
  });
});

describe('criteria 14–16 — snippets through the live connection', () => {
  it('in an empty app-probe.fudspec, the first item is the component snippet, preselected, with app-probe first (criterion 14)', async () => {
    const items = await complete('|');
    const preselected = items.filter((i) => i.preselect === true);
    expect(preselected).toHaveLength(1);
    expect(items[0]).toBe(preselected[0]);
    expect(items[0]).toMatchObject({
      label: 'component',
      insertText: 'component ${1|app-probe,app-badge,site-nav|}',
      insertTextFormat: 2,
    });
  });

  it('offers the criterion snippet with props, and the bare keywords too (criterion 15)', async () => {
    const items = await complete('component app-probe\n\n|');
    expect(items.map((i) => i.label)).toEqual(['component', 'criterion', 'criterion']);
    const criterion = items.find((i) => i.insertTextFormat === 2);
    expect(criterion?.insertText).toBe('criterion ${1:slug}\n  given\n    props ${2:base}\n  then\n    $0');
  });

  it('inserts a term with one stop per parameter, the first offering the tags (criterion 16)', async () => {
    const items = await complete('component app-probe\n\ncriterion a\n  then\n    |');
    expect(items).toEqual([
      expect.objectContaining({
        label: 'visible',
        insertText: 'visible ${1|app-badge,app-probe,site-nav,role:|}',
        insertTextFormat: 2,
      }),
    ]);
    const blocks = await complete('component app-probe\n\ncriterion a\n  |');
    expect(blocks.map((i) => i.label)).toEqual(['given', 'when', 'then']);
  });
});

describe('criterion 17 — the light bulb through the live connection', () => {
  const BROKEN = 'component app-probe\n\ncriterion a\n  given\n    props primera\n  then\n    visibl app-probe\n';

  it('offers the repairs of each diagnostic, the fixture filled by type from the TS program', async () => {
    const actions = await bulb(BROKEN);
    expect(actions.map((a) => a.title).sort()).toEqual(["Change to 'visible'", 'Create app-probe.fixture.ts', 'Create then/visibl.js']);

    const fixture = actions.find((a) => a.title === 'Create app-probe.fixture.ts');
    const [create, write] = fixture?.edit?.documentChanges as unknown as [{ uri: string }, { edits: TextEdit[] }];
    expect(toPosix(URI.parse(create.uri).fsPath)).toBe(`${root}/components/app-probe.fixture.ts`);
    expect(write.edits[0]?.newText).toBe(
      fixtureModule('app-probe', ['primera'], [
        { name: 'label', required: true, shape: { kind: 'string' } },
        {
          name: 'tone',
          required: true,
          shape: {
            kind: 'union',
            members: [
              { kind: 'literal', value: 'info' },
              { kind: 'literal', value: 'warn' },
            ],
          },
        },
        {
          name: 'items',
          required: true,
          shape: { kind: 'array', element: { kind: 'object', props: [{ name: 'id', required: true, shape: { kind: 'number' } }] } },
        },
      ]),
    );
    expect(write.edits[0]?.newText).toContain("  primera: { label: '', tone: 'info', items: [] },\n");

    const term = actions.find((a) => a.title === 'Create then/visibl.js');
    const [termCreate] = term?.edit?.documentChanges as unknown as [{ uri: string }];
    expect(toPosix(URI.parse(termCreate.uri).fsPath)).toBe(`${root}/fudic/terms/then/visibl.js`);
  });

  it('offers nothing on a file without diagnostics', async () => {
    writeFileSync(`${root}/components/app-probe.fixture.ts`, "export default { base: { label: '', tone: 'info', items: [] } };\n");
    const sound = 'component app-probe\n\ncriterion a\n  given\n    props base\n  then\n    visible app-probe\n';
    expect(await show(sound)).toEqual([]);
    expect(await bulb(sound)).toEqual([]);
  });
});

describe('criterion 23 — formatting through the live connection', () => {
  const format = async (text: string): Promise<TextEdit[]> => {
    await show(text);
    const got = await harness.client.sendRequest(DocumentFormattingRequest.type, {
      textDocument: { uri: harness.uriOf(SPEC) },
      options: { tabSize: 2, insertSpaces: true },
    });
    return got ?? [];
  };

  it('returns one edit with what formatSpec writes', async () => {
    const messy = 'component app-probe\ncriterion a\n   then  \n      visible   app-probe\n';
    const edits = await format(messy);
    expect(edits).toHaveLength(1);
    expect(edits[0]?.newText).toBe(formatSpec(messy).text);
  });

  it('returns nothing for a formatted file', async () => {
    expect(await format('component app-probe\n')).toEqual([]);
  });
});
