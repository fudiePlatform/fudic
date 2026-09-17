/**
 * SDD-43 §4.2 — THE MEASUREMENT, editor side. Questions 2, 3 and 5.
 *
 * The index sweeps a workspace FOLDER and prunes `node_modules` (SDD-24 §4.5). Whether a
 * library's `.fud` is in the TypeScript program therefore depends on something the spec never
 * names: which folder the editor was opened on.
 *
 *   at the root     the library is `libs/ui/src/…` under the swept folder — an ordinary file
 *   at the app      the library is only reachable through `node_modules`, which is pruned
 *
 * Both are measured here, on the same workspace, because they are the difference between
 * `$Props` being a type and being `any` — and `any` is BUG-23, which is what §1.1 says this
 * spec must not reintroduce.
 *
 * The href used is the RELATIVE one. A bare specifier cannot be measured from the editor at
 * all yet, for a reason that has nothing to do with resolution: `@` opens an `@`-construct in
 * a `.fud`, so `@acme/ui/ui-card.fud` loses its scope in the parser. That is recorded in
 * `packages/vite/test/lib-resolution-probe.test.ts` and in `docs/sdd/SDD-43-medicion.md`.
 *
 * A test marked `it.fails` is a measurement that came out negative, not a broken test.
 */

import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DocumentDiagnosticRequest,
  type Diagnostic,
  type FullDocumentDiagnosticReport,
} from 'vscode-languageserver-protocol/node';
import { toPosix } from '../../src/paths.js';
import { startHarness, type Harness } from './_harness.js';

/** The library's component: one REQUIRED prop, typed, so a wrong value is observable. */
const CARD = `@code {
  const { title } = props<{ title: string }>();
}

<ui-card>
  <template shadowrootmode="open">
    <article><h2>@title</h2><slot></slot></article>
  </template>
</ui-card>
`;

const LAYOUT = `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    @RenderHead()
  </head>
  <body><main>@RenderBody()</main></body>
</html>
`;

const TSCONFIG = JSON.stringify(
  {
    compilerOptions: {
      target: 'ES2024',
      module: 'ESNext',
      moduleResolution: 'bundler',
      lib: ['ES2024', 'DOM', 'DOM.Iterable'],
      strict: true,
      skipLibCheck: true,
      noEmit: true,
    },
    include: ['**/*.ts', '**/*.fud'],
  },
  null,
  2,
);

/** From `apps/tienda/src/routes/` up to the workspace root, then down into the library. */
const HREF = '../../../../libs/ui/src/ui-card.fud';

/** The page under measurement: a NUMBER where the contract says `string`. */
const PAGE = `<link rel="layout" href="../layouts/_layout.fud">
<link rel="component" href="${HREF}">

<ui-card .title="@(42)">contenido</ui-card>
`;

const ROUTE = 'apps/tienda/src/routes/index.fud';

/** A workspace with a library and an app, on disk, installed the way pnpm installs. */
function makeWorkspace(): string {
  const ws = mkdtempSync(join(tmpdir(), 'fudic-libidx-'));

  const lib = join(ws, 'libs', 'ui');
  mkdirSync(join(lib, 'src'), { recursive: true });
  writeFileSync(join(lib, 'src', 'ui-card.fud'), CARD);
  writeFileSync(join(lib, 'fudic.json'), JSON.stringify({ kind: 'lib', prefix: 'ui' }, null, 2));
  writeFileSync(
    join(lib, 'package.json'),
    JSON.stringify(
      {
        name: '@acme/ui',
        version: '1.0.0',
        type: 'module',
        files: ['src'],
        exports: { './ui-card.fud': './src/ui-card.fud' },
      },
      null,
      2,
    ),
  );

  const app = join(ws, 'apps', 'tienda');
  mkdirSync(join(app, 'src', 'routes'), { recursive: true });
  mkdirSync(join(app, 'src', 'layouts'), { recursive: true });
  writeFileSync(join(app, 'src', 'layouts', '_layout.fud'), LAYOUT);

  // `startHarness` warms the TypeScript program up by opening `layouts/_layout.fud` at the
  // root of whatever folder it was given, so each of the two roots needs one. They are the
  // harness's own cold start, not part of what is being measured.
  for (const root of [ws, app]) {
    mkdirSync(join(root, 'layouts'), { recursive: true });
    writeFileSync(join(root, 'layouts', '_layout.fud'), LAYOUT);
  }
  writeFileSync(join(app, 'src', 'routes', 'index.fud'), PAGE);
  writeFileSync(join(app, 'fudic.json'), JSON.stringify({ kind: 'app', id: 'tienda' }, null, 2));
  writeFileSync(join(app, 'tsconfig.json'), TSCONFIG);
  writeFileSync(join(ws, 'tsconfig.json'), TSCONFIG);

  // What pnpm leaves behind: a symlink, so the package's files live under the workspace root
  // and not inside `node_modules`. Question 5 of §4.2 is about exactly this.
  const scope = join(app, 'node_modules', '@acme');
  mkdirSync(scope, { recursive: true });
  symlinkSync(lib, join(scope, 'ui'), 'junction');

  return toPosix(ws);
}

/** Every diagnostic the editor would show on the page, from a server rooted at `root`. */
async function diagnosticsFrom(harness: Harness, relative: string): Promise<Diagnostic[]> {
  const { uri } = await harness.open(relative);
  const report = (await harness.client.sendRequest(DocumentDiagnosticRequest.type, {
    textDocument: { uri },
  })) as FullDocumentDiagnosticReport;
  return report.items;
}

let ws: string;
let atRoot: Harness;
let atApp: Harness;
let rootDiagnostics: Diagnostic[];
let appDiagnostics: Diagnostic[];

beforeAll(async () => {
  ws = makeWorkspace();
  atRoot = await startHarness({ root: ws });
  atApp = await startHarness({ root: `${ws}/apps/tienda` });
  rootDiagnostics = await diagnosticsFrom(atRoot, ROUTE);
  appDiagnostics = await diagnosticsFrom(atApp, 'src/routes/index.fud');
}, 120_000);

afterAll(async () => {
  await atRoot.stop();
  await atApp.stop();
});

/**
 * The index keys files by the path the SERVER was given, and that path came back from a
 * `file:` URI — which lowercases the Windows drive letter. Comparing against a path this test
 * built with `mkdtemp` is comparing `C:/…` with `c:/…`.
 */
const sameFile = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

describe('SDD-43 §4.2 — the editor opened on the workspace root', () => {
  it('indexes the library `.fud` (question 2)', () => {
    const paths = atRoot.server.index.all().map((entry) => entry.path);
    expect(paths.some((path) => sameFile(path, `${ws}/libs/ui/src/ui-card.fud`))).toBe(true);
  });

  it('knows the tag the library defines', () => {
    const entry = atRoot.server.index
      .all()
      .find((candidate) => sameFile(candidate.path, `${ws}/libs/ui/src/ui-card.fud`));
    expect(entry?.tag).toBe('ui-card');
    expect(entry?.requiredProps).toEqual(['title']);
  });

  it('reports a number passed to a `string` prop (question 3)', () => {
    // The BUG-23 probe: with `$Props` as `any` the checker says nothing at all.
    expect(rootDiagnostics.map((d) => d.message).join('\n')).toMatch(/number.*string|string.*number/s);
  });
});

describe('SDD-43 §4.2 — the editor opened on the app alone', () => {
  it('does NOT index the library `.fud`: it is only reachable through node_modules', () => {
    const paths = atApp.server.index.all().map((entry) => entry.path);
    expect(paths.some((path) => path.endsWith('/ui-card.fud'))).toBe(false);
  });

  it.fails('reports a number passed to a `string` prop', () => {
    // `$Props` is `any` here, so nothing is reported — the symptom of BUG-23, reached
    // through the door of libraries. This is what SDD-43 §4.4 has to close.
    expect(appDiagnostics.map((d) => d.message).join('\n')).toMatch(/number.*string|string.*number/s);
  });

  it('reports the href as pointing at no file (FUD0460), which it does', () => {
    // Worse than silence: the library IS installed and the path IS right, but the index
    // cannot see past the `node_modules` prune, so the editor calls a working link broken.
    expect(appDiagnostics.map((d) => d.code)).toContain('FUD0460');
  });
});
