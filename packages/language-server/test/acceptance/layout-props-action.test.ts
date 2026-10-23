/**
 * SDD-40 §6.12 and SDD-60 §4.7 — the light bulb over a layout contract, on a real LSP round trip.
 *
 * Its own workspace, because the subject is the LAYOUT: giving the shared fixtures a required
 * prop would put this bulb over every route in every other suite.
 *
 * The division of labour is SDD-36's, unchanged: the fact is TypeScript's, and the server
 * contributes the hands. Since SDD-60 the hands write `layout` in the route's `.fudapi` and link
 * it; the props are then what its handler in `src/server` returns, and TypeScript asks for each.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { rmSync, writeFileSync } from 'node:fs';
import { CodeActionRequest, DocumentDiagnosticRequest } from 'vscode-languageserver-protocol/node';
import { copyWorkspace, startHarness, type Harness } from './_harness.js';

let harness: Harness;
let root: string;

/** A layout with four required props: one of each shape a repair can write. */
const LAYOUT = `<!DOCTYPE html>
<html lang="@culture" data-theme="@(dark ? 'dark' : 'light')">
  <head>
    @code {
      type Props = { culture: string; year: number; dark: boolean; user: { id: string } };
      const { culture, year, dark, user } = props<Props>();
    }
    <meta charset="utf-8">
    <meta name="copyright" content="@year @user.id">
    @RenderHead()
  </head>
  <body>
    <main>@RenderBody()</main>
  </body>
</html>
`;

/** The same layout with every prop optional: a route that resolves none is not in error. */
const OPTIONAL = LAYOUT.replace(
  'type Props = { culture: string; year: number; dark: boolean; user: { id: string } };',
  'type Props = { culture?: string; year?: number; dark?: boolean; user?: { id: string } };',
).replace('content="@year @user.id"', 'content="@year"');

beforeAll(async () => {
  root = copyWorkspace();
  // BEFORE the harness starts: the workspace index is built at startup, and a layout written
  // afterwards resolves to nothing — which would make every «no action offered» assertion
  // below pass for the wrong reason.
  writeFileSync(`${root}/src/layouts/_layout.fud`, LAYOUT, 'utf8');
  writeFileSync(`${root}/src/layouts/_optional.fud`, OPTIONAL, 'utf8');
  harness = await startHarness({ root });
}, 60_000);

afterAll(async () => {
  await harness.stop();
});

interface WireAction {
  readonly title: string;
  readonly edit?: { readonly changes?: Record<string, { readonly newText: string }[]> };
}

const route = (code: string): string =>
  `<link rel="layout" href="../layouts/_layout.fud">\n${code}<h1>hola</h1>\n`;

/** Every action the client would see with the caret on the `<link rel="layout">`. */
async function actionsOn(source: string): Promise<readonly WireAction[]> {
  const { uri, text } = await harness.open('src/blog/[slug].fud', source);
  const at = harness.positionAt(text, source.indexOf('rel="layout"'));
  const got = await harness.client.sendRequest(CodeActionRequest.type, {
    textDocument: { uri },
    range: { start: at, end: at },
    context: { diagnostics: [] },
  });
  return (got ?? []) as readonly WireAction[];
}

const completing = (actions: readonly WireAction[]): WireAction | undefined =>
  actions.find((action) => action.title === 'Completar las props requeridas del layout');

/**
 * The ERRORS the server reports for a route source.
 *
 * Severity 1 and nothing softer, because what §6.13 promises is that the repair leaves no type
 * ERROR it created itself. A resolver whose `ctx` is not read yet is `TS6133`, a hint the
 * editor greys out — the author has not used it YET, which is the state every freshly written
 * function is in, and a repair that contorted the signature to avoid it would be writing worse
 * code to satisfy a test.
 */
async function codesOf(source: string): Promise<string[]> {
  const { uri } = await harness.open('src/blog/[slug].fud', source);
  const got = await harness.client.sendRequest(DocumentDiagnosticRequest.type, {
    textDocument: { uri },
  });
  const items = (got as { items?: { code?: unknown; severity?: number }[] }).items ?? [];
  return items.filter((item) => item.severity === 1).map((item) => String(item.code));
}

describe('§6.12 — the bulb is offered, and the server reports nothing of its own', () => {
  it('offers the repair over the `<link rel="layout">`', async () => {
    expect(completing(await actionsOn(route('')))).toBeDefined();
  });

  it('does NOT report a diagnostic of its own: the voice is TypeScript’s', async () => {
    // `FUD0702` is the BUILD's. In the editor a second reporter would be the duplication
    // SDD-36 removed, so the server's own codes must not include it.
    expect(await codesOf(route(''))).not.toContain('FUD0702');
  });
});

describe('SDD-60 §4.7 — the route gets `layout` in its `.fudapi`', () => {
  /** One change of a `documentChanges` edit, as it travels. */
  interface WireChange {
    readonly kind?: string;
    readonly uri?: string;
    readonly textDocument?: { readonly uri: string };
    readonly edits?: readonly { readonly newText: string; readonly range: { readonly start: { line: number; character: number } } }[];
  }
  const changesOf = (action: WireAction | undefined): readonly WireChange[] =>
    ((action?.edit as { documentChanges?: WireChange[] } | undefined)?.documentChanges ?? []);
  const sibling = (): string => `${root}/src/blog/[slug].fudapi`;
  const isSibling = (uri: string | undefined): boolean => decodeURIComponent(uri ?? '').endsWith('/blog/[slug].fudapi');

  afterEach(() => {
    rmSync(sibling(), { force: true });
  });

  it('creates the `.fudapi` with `layout` and links it after the layout link', async () => {
    rmSync(sibling(), { force: true }); // the copied workspace ships one
    const changes = changesOf(completing(await actionsOn(route(''))));

    expect(changes).toHaveLength(3);
    expect(changes[0]).toMatchObject({ kind: 'create' });
    expect(isSibling(changes[0]?.uri)).toBe(true);
    expect(isSibling(changes[1]?.textDocument?.uri)).toBe(true);
    expect(changes[1]?.edits?.[0]?.newText).toBe('layout\n');
    expect(changes[2]?.edits?.[0]).toMatchObject({
      newText: '\n<link rel="server" href="./[slug].fudapi">',
      range: { start: { line: 0, character: '<link rel="layout" href="../layouts/_layout.fud">'.length } },
    });
  });

  it('appends `layout` after a blank line to a `.fudapi` that exists', async () => {
    writeFileSync(sibling(), 'paths', 'utf8');
    const changes = changesOf(completing(await actionsOn(route(''))));

    expect(changes[0]?.kind).toBeUndefined();
    expect(changes[0]?.edits?.[0]).toMatchObject({ newText: '\n\nlayout\n', range: { start: { line: 0, character: 5 } } });
    expect(changes).toHaveLength(2);
  });

  it('writes only what is missing: the declaration, or the link', async () => {
    writeFileSync(sibling(), 'paths\n', 'utf8');
    const linked = route('').replace('\n', '\n<link rel="server" href="./[slug].fudapi">\n');
    const declaration = changesOf(completing(await actionsOn(linked)));
    expect(declaration).toHaveLength(1);
    expect(declaration[0]?.edits?.[0]?.newText).toBe('\nlayout\n');

    writeFileSync(sibling(), 'layout\n', 'utf8');
    const link = changesOf(completing(await actionsOn(route(''))));
    expect(link).toHaveLength(1);
    expect(link[0]?.edits?.[0]?.newText).toBe('\n<link rel="server" href="./[slug].fudapi">');
  });

  it('offers nothing once the `.fudapi` declares `layout` and the route links it', async () => {
    writeFileSync(sibling(), 'layout\n', 'utf8');
    const linked = route('').replace('\n', '\n<link rel="server" href="./[slug].fudapi">\n');
    expect(completing(await actionsOn(linked))).toBeUndefined();
  });
});

describe('the cases where a repair would be guessing', () => {
  it('offers nothing over a layout href that resolves to no file', async () => {
    // `FUD0433` already speaks for a broken `href`, and a contract read from a file nobody
    // found would be a repair against a layout that does not exist.
    const source = '<link rel="layout" href="../layouts/_absent.fud">\n<h1>hola</h1>\n';
    expect(completing(await actionsOn(source))).toBeUndefined();
  });

  it('offers nothing when the layout requires nothing', async () => {
    const source = '<link rel="layout" href="../layouts/_optional.fud">\n<h1>hola</h1>\n';
    // The layout resolves: the route typechecks against it, which is what says the index
    // really saw the file — an href that resolved to nothing would offer no action either.
    expect(await codesOf(source)).toEqual([]);
    expect(completing(await actionsOn(source))).toBeUndefined();
  });
});
