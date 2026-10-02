/**
 * SDD-53 criterion 13 — one generator, two clients: the fixture `fudic g spec` writes is, byte for
 * byte, the one the light bulb creates for the same component, both reading its props with the
 * project's own TypeScript program.
 */

import { writeFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CodeActionRequest, DocumentDiagnosticRequest, type CodeAction, type FullDocumentDiagnosticReport, type TextEdit } from 'vscode-languageserver-protocol/node';
import { nodeReadIo, planSpec } from '@fudic/cli';
import { specSkeleton } from '@fudic/spec';
import { copyWorkspace, startHarness, type Harness } from '../acceptance/_harness.js';

const PROBE = `@code {
  const { label, tone, count, items } = props<{ label: string; tone: 'info' | 'warn'; count?: number; items: { id: number }[]; onPick: () => void }>();
}

<app-probe>
  <template shadowrootmode="open">
    <span>@label</span>
  </template>
</app-probe>
`;

let root: string;
let harness: Harness;

beforeAll(async () => {
  root = copyWorkspace();
  writeFileSync(`${root}/fudic.json`, JSON.stringify({ id: 'probe', kind: 'app', prefix: 'app' }));
  writeFileSync(`${root}/components/app-probe.fud`, PROBE);
  harness = await startHarness({ root });
}, 60_000);

afterAll(async () => {
  await harness.stop();
});

describe('the CLI and the light bulb write the same file (criterion 13)', () => {
  it('the fixture of `g spec` is the one «Create app-probe.fixture.ts» creates', async () => {
    const plan = await planSpec('probe', { cwd: root, force: false }, nodeReadIo());
    expect(plan.errors).toEqual([]);
    const [spec, fixture] = plan.changes;
    expect(spec).toMatchObject({ path: 'components/app-probe.fudspec', contents: specSkeleton('app-probe', true) });
    expect(fixture?.path).toBe('components/app-probe.fixture.ts');
    expect(fixture?.contents).toContain("  base: { label: '', tone: 'info', items: [] },\n");

    // The file the skeleton asks for, with its one criterion written: `props base`.
    const text = 'component app-probe\n\ncriterion a\n  given\n    props base\n  then\n    min-height app-probe 44\n';
    await harness.open('components/app-probe.fudspec', text, 'fudspec');
    const uri = harness.uriOf('components/app-probe.fudspec');
    const report = (await harness.client.sendRequest(DocumentDiagnosticRequest.type, { textDocument: { uri } })) as FullDocumentDiagnosticReport;
    const actions = ((await harness.client.sendRequest(CodeActionRequest.type, {
      textDocument: { uri },
      range: { start: { line: 0, character: 0 }, end: { line: 7, character: 0 } },
      context: { diagnostics: report.items },
    })) ?? []) as CodeAction[];

    const create = actions.find((a) => a.title === 'Create app-probe.fixture.ts');
    const [, write] = create?.edit?.documentChanges as [unknown, { edits: TextEdit[] }];
    expect(write.edits[0]?.newText).toBe(fixture?.contents);
  });
});
