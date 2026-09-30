/**
 * A required section of the layout, over a real LSP round trip (SDD-48).
 *
 * The route that leaves it unfilled is told so on its `<link rel="layout">`, and the bulb there
 * writes the section — the diagnostic and the edit as the client receives them.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { CodeActionRequest, DocumentDiagnosticRequest } from 'vscode-languageserver-protocol/node';
import { copyWorkspace, startHarness, type Harness } from './_harness.js';

let harness: Harness;

const FRAME_LAYOUT = `<!DOCTYPE html>
<html lang="es">
  <head>
    @RenderHead()
  </head>
  <body>
    @RenderSection(cabecera, required: true)
    @RenderSection(pie, required: true)
    @RenderSection(lateral)
    <main>@RenderBody()</main>
  </body>
</html>
`;

beforeAll(async () => {
  const root = copyWorkspace();
  writeFileSync(`${root}/layouts/_marco.fud`, FRAME_LAYOUT, 'utf8');
  harness = await startHarness({ root });
}, 60_000);

afterAll(async () => {
  await harness.stop();
});

const route = (body: string): string => `<link rel="layout" href="../layouts/_marco.fud">\n\n${body}`;

interface WireDiagnostic {
  readonly code?: unknown;
  readonly message: string;
  readonly range: unknown;
}

interface WireAction {
  readonly title: string;
  readonly edit?: { readonly changes?: Record<string, { readonly newText: string }[]> };
}

async function report(body: string): Promise<{ uri: string; items: readonly WireDiagnostic[] }> {
  const { uri } = await harness.open('blog/marco.fud', route(body));
  const got = await harness.client.sendRequest(DocumentDiagnosticRequest.type, { textDocument: { uri } });
  return { uri, items: ((got as { items?: WireDiagnostic[] }).items ?? []) };
}

describe('FUD0440 — a required section the route leaves unfilled', () => {
  it('is reported on the layout link, naming every missing section', async () => {
    const { items } = await report('@section pie {\n  <p>pie</p>\n}\n');
    const missing = items.filter((d) => d.code === 'FUD0440');

    expect(missing).toHaveLength(1);
    expect(missing[0]?.message).toContain('`cabecera`');
    expect(missing[0]?.message).not.toContain('`pie`');
  });

  it('says nothing once every required section is declared', async () => {
    const { items } = await report('@section cabecera {\n}\n\n@section pie {\n}\n');

    expect(items.map((d) => d.code)).not.toContain('FUD0440');
  });

  it('offers a bulb that writes the missing sections after the last one', async () => {
    const { uri, items } = await report('<p>cuerpo</p>\n');
    const diagnostic = items.find((d) => d.code === 'FUD0440')!;
    const got = (await harness.client.sendRequest(CodeActionRequest.type, {
      textDocument: { uri },
      range: diagnostic.range as never,
      context: { diagnostics: [diagnostic] as never },
    })) as readonly WireAction[];
    const action = got.find((a) => a.title.startsWith('Añadir las secciones requeridas'));
    const changes = Object.values(action?.edit?.changes ?? {})[0];

    expect(action?.title).toContain('cabecera, pie');
    expect(changes?.map((e) => e.newText)).toEqual(['\n\n@section cabecera {\n}\n\n@section pie {\n}']);
  });
});
