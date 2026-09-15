/**
 * SDD-40 §6.12–§6.14 — the light bulb over a layout contract, on a real LSP round trip.
 *
 * Its own workspace, because the subject is the LAYOUT: giving the shared fixtures a required
 * prop would put this bulb over every route in every other suite.
 *
 * The division of labour is SDD-36's, unchanged. The fact is TypeScript's — the projection
 * gives the route's `layout(ctx, data)` the layout's `$Props` as its return type, so the error
 * lands on the author's own `return` — and the server contributes the hands. What the repair
 * writes has to be a value OF each prop's type, because a repair that leaves the file with an
 * error it created itself is worse than no repair at all.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { CodeActionRequest, DocumentDiagnosticRequest } from 'vscode-languageserver-protocol/node';
import { copyWorkspace, startHarness, type Harness } from './_harness.js';

let harness: Harness;
let root: string;

/** A layout with four required props: one of each shape a repair can write. */
const LAYOUT = `<!DOCTYPE html>
<html lang="@culture">
  <head>
    @code {
      type Props = { culture: string; year: number; dark: boolean; user: { id: string } };
      const { culture, year, dark, user } = props<Props>();
    }
    <meta charset="utf-8">
    @RenderHead()
  </head>
  <body data-theme="@(dark ? 'dark' : 'light')">
    <main>@RenderBody()</main>
    <p>@year @user.id</p>
  </body>
</html>
`;

/** The same layout with every prop optional: a route that resolves none is not in error. */
const OPTIONAL = LAYOUT.replace(
  'type Props = { culture: string; year: number; dark: boolean; user: { id: string } };',
  'type Props = { culture?: string; year?: number; dark?: boolean; user?: { id: string } };',
).replace('<p>@year @user.id</p>', '<p>@year</p>');

/** A layout whose one prop states no type at all — required, and not provable beyond that. */
const UNTYPED = LAYOUT.replace(
  'type Props = { culture: string; year: number; dark: boolean; user: { id: string } };\n' +
    '      const { culture, year, dark, user } = props<Props>();',
  'const { culture } = props<{ culture }>();',
)
  .replace(`data-theme="@(dark ? 'dark' : 'light')"`, '')
  .replace('<p>@year @user.id</p>', '');

beforeAll(async () => {
  root = copyWorkspace();
  // BEFORE the harness starts: the workspace index is built at startup, and a layout written
  // afterwards resolves to nothing — which would make every «no action offered» assertion
  // below pass for the wrong reason.
  writeFileSync(`${root}/layouts/_layout.fud`, LAYOUT, 'utf8');
  writeFileSync(`${root}/layouts/_optional.fud`, OPTIONAL, 'utf8');
  writeFileSync(`${root}/layouts/_untyped.fud`, UNTYPED, 'utf8');
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
  const { uri, text } = await harness.open('blog/[slug].fud', source);
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

/** The single insertion a repair carries, applied to the source it was computed from. */
function applied(source: string, action: WireAction | undefined): string {
  const changes = Object.values(action?.edit?.changes ?? {})[0] ?? [];
  expect(changes).toHaveLength(1);
  const edit = changes[0] as unknown as {
    newText: string;
    range: { start: { line: number; character: number }; end: { line: number; character: number } };
  };
  const lines = source.split('\n');
  const offsetOf = (p: { line: number; character: number }): number =>
    lines.slice(0, p.line).reduce((n, line) => n + line.length + 1, 0) + p.character;
  return (
    source.slice(0, offsetOf(edit.range.start)) + edit.newText + source.slice(offsetOf(edit.range.end))
  );
}

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
  const { uri } = await harness.open('blog/[slug].fud', source);
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

  it('says nothing once the route resolves every required prop', async () => {
    const resolved = route(
      '@code {\n  @server {\n' +
        '    export function layout(ctx: unknown, data: unknown) {\n' +
        "      return { culture: '', year: 0, dark: false, user: { id: '' } };\n" +
        '    }\n  }\n}\n',
    );
    expect(completing(await actionsOn(resolved))).toBeUndefined();
  });
});

describe('§6.13 — what it writes is of the type of each prop', () => {
  it('a scalar gets its own literal and anything else a typed hole', async () => {
    const source = route('');
    const written = applied(source, completing(await actionsOn(source)));

    expect(written).toContain("culture: ''");
    expect(written).toContain('year: 0');
    expect(written).toContain('dark: false');
    // No obvious value to invent, so the hole carries the type instead of a guess.
    expect(written).toContain('user: null as unknown as { id: string }');
  });

  it('the file it leaves behind has no type errors of its own making', async () => {
    const source = route('');
    const written = applied(source, completing(await actionsOn(source)));

    expect(await codesOf(written)).toEqual([]);
    // And the repair is not offered a second time over its own work.
    expect(completing(await actionsOn(written))).toBeUndefined();
  });
});

describe('§6.14 — how much scaffolding it writes depends on what is already there', () => {
  it('fills the `return` of a resolver that exists, keeping what it held', async () => {
    const source = route(
      '@code {\n  @server {\n' +
        '    export function layout(ctx: unknown, data: unknown) {\n' +
        "      return { culture: 'es' };\n" +
        '    }\n  }\n}\n',
    );
    const written = applied(source, completing(await actionsOn(source)));

    expect(written).toContain("culture: 'es'");
    expect(written).toContain('year: 0');
    expect(await codesOf(written)).toEqual([]);
  });

  it('fills an EMPTY `return {}` without leaving a stray comma', async () => {
    const source = route(
      '@code {\n  @server {\n' +
        '    export function layout(ctx: unknown, data: unknown) {\n' +
        '      return {};\n' +
        '    }\n  }\n}\n',
    );
    const written = applied(source, completing(await actionsOn(source)));

    expect(written).toContain("return { culture: '', year: 0, dark: false,");
    expect(written).not.toContain('return {,');
    expect(await codesOf(written)).toEqual([]);
  });

  it('writes the whole function into a `@server` that exists', async () => {
    const source = route(
      '@code {\n  @server {\n    export function load() { return {}; }\n  }\n}\n',
    );
    const written = applied(source, completing(await actionsOn(source)));

    expect(written).toContain('export function layout(ctx: unknown, data: unknown) {');
    expect(written).toContain('export function load() { return {}; }');
    expect(await codesOf(written)).toEqual([]);
  });

  it('creates the `@server` region when the `@code` has none', async () => {
    const source = route('@code {\n  const n = 1;\n}\n');
    const written = applied(source, completing(await actionsOn(source)));

    expect(written).toContain('@server {');
    expect(written).toContain('export function layout(ctx: unknown, data: unknown) {');
    expect(await codesOf(written)).toEqual([]);
  });

  it('creates the whole `@code` block when the route has none', async () => {
    const source = route('');
    const written = applied(source, completing(await actionsOn(source)));

    expect(written).toContain('@code {');
    expect(written).toContain('@server {');
    expect(await codesOf(written)).toEqual([]);
  });
});

describe('the cases where a repair would be guessing', () => {
  it('offers nothing over a `return` it cannot read', async () => {
    // A field inserted beside a spread could be the very prop the spread already carries.
    const source = route(
      '@code {\n  @server {\n' +
        '    const defaults = { culture: "es", year: 0, dark: false, user: { id: "" } };\n' +
        '    export function layout(ctx: unknown, data: unknown) {\n' +
        '      return { ...defaults };\n' +
        '    }\n  }\n}\n',
    );
    expect(completing(await actionsOn(source))).toBeUndefined();
  });

  it('falls back to an empty string for a prop whose type the layout never stated', async () => {
    // «Not provable» is not «no prop»: the key carries no `?`, so it is required, and the
    // repair writes what most props take rather than inventing a type to write against.
    const source = '<link rel="layout" href="../layouts/_untyped.fud">\n<h1>hola</h1>\n';
    const written = applied(source, completing(await actionsOn(source)));

    expect(written).toContain("culture: ''");
  });

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
