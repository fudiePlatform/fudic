/**
 * The light bulb over a real LSP round trip (SDD-36 §3.1).
 *
 * Every other test of the bulb calls `codeActions()` and reads what it returns, and all of them
 * passed while the repair did nothing in VS Code. What they could not see is the two things that
 * only exist on the wire: a plugin is handed VOLAR's document, whose uri is
 * `volar-embedded-content://root/…` and not the file, and Volar rewrites that uri on its way out
 * for an `edit` and cannot for the arguments of a `command`. A bulb that travelled as a command
 * therefore arrived pointing at a virtual document nobody can write.
 *
 * So these assert the shape that reaches the client, and nothing about how it was built.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { CodeActionRequest, DocumentDiagnosticRequest } from 'vscode-languageserver-protocol/node';
import { copyWorkspace, startHarness, type Harness } from './_harness.js';

let harness: Harness;

/** A component with two REQUIRED props: the tag the repair has something to complete. */
const APP_INPUT = `@code {
  type Props = {
    id: number;
    name: string;
  };
  const { id, name } = props<Props>();
}

<app-input>
  <template shadowrootmode="open"><input id="@(String(id))" name="@name"></template>
</app-input>
`;

beforeAll(async () => {
  const root = copyWorkspace();
  writeFileSync(`${root}/components/app-input.fud`, APP_INPUT, 'utf8');
  harness = await startHarness({ root });
}, 60_000);

afterAll(async () => {
  await harness.stop();
});

const page = (body: string): string =>
  `<link rel="layout" href="../layouts/_layout.fud">\n` +
  `<link rel="component" href="../components/app-input.fud">\n` +
  `${body}\n`;

interface WireAction {
  readonly title: string;
  readonly command?: unknown;
  readonly edit?: { readonly changes?: Record<string, { readonly newText: string }[]> };
}

/**
 * The actions the client would see with the caret inside the first diagnostic.
 *
 * Driven by the diagnostics the server itself just reported, which is what VS Code sends back
 * in the code-action context — asking with an empty context measures a client nobody runs.
 */
async function actionsOn(body: string): Promise<readonly WireAction[]> {
  const source = page(body);
  const { uri } = await harness.open('blog/[slug].fud', source);
  const report = await harness.client.sendRequest(DocumentDiagnosticRequest.type, {
    textDocument: { uri },
  });
  const first = ((report as { items?: unknown[] }).items ?? [])[0] as { range: unknown };

  const got = await harness.client.sendRequest(CodeActionRequest.type, {
    textDocument: { uri },
    range: first.range as never,
    context: { diagnostics: [first] as never },
  });
  return (got ?? []) as readonly WireAction[];
}

const completing = (actions: readonly WireAction[]): WireAction | undefined =>
  actions.find((action) => action.title.startsWith('Completar las props'));

describe('a repair as the client receives it', () => {
  it('completes the required props of a tag that passes none', async () => {
    const action = completing(await actionsOn('<app-input></app-input>'));
    const changes = Object.values(action?.edit?.changes ?? {})[0];

    expect(changes?.map((edit) => edit.newText)).toEqual([' .id="" .name=""']);
  });

  it('carries an edit and never a command', async () => {
    // The whole of the defect, in one assertion. A `command` cannot be made to work here: its
    // arguments are opaque to Volar, so the uri inside them stays the embedded one.
    const action = completing(await actionsOn('<app-input></app-input>'));

    expect(action?.command).toBeUndefined();
    expect(action?.edit).toBeDefined();
  });

  it('addresses the .fud on disk, not the embedded document of the projection', async () => {
    const action = completing(await actionsOn('<app-input></app-input>'));
    const [target] = Object.keys(action?.edit?.changes ?? {});

    expect(target?.startsWith('file://')).toBe(true);
    expect(target?.endsWith('.fud')).toBe(true);
  });

  it('inserts once, so no client has to choose the order of two holes', async () => {
    // Two zero-length inserts at one offset are two edits a client may apply either way round.
    const action = completing(await actionsOn('<app-input></app-input>'));

    expect(Object.values(action?.edit?.changes ?? {})[0]).toHaveLength(1);
  });
});
