/**
 * SDD-43 §4.2 — THE MEASUREMENT, build side. Questions 1, 4 and 5.
 *
 * This file measures; it does not implement. Before specifying how a library is resolved it
 * has to be known what already resolves, because in a pnpm workspace `node_modules/@acme/ui`
 * is a symlink to a real directory under the root, and a relative `href` that crosses into
 * `libs/ui` is just a path on disk. Half a spec can be already working.
 *
 * Four builds of the same page, differing only in how it names the library's component:
 *
 *   relative-linked   `../../libs/ui/src/ui-card.fud`, library reachable as a symlink
 *   relative-real     the same href, library reachable as a real directory
 *   bare-linked       `@acme/ui/ui-card.fud`, library as a symlink
 *   bare-real         the same specifier, library as a real directory
 *
 * A test that is `it.fails` here is a measurement that came out negative, not a broken test:
 * it is the red-first of a later phase, and it flips to a plain `it` when that phase lands.
 * The report is `docs/sdd/SDD-43-medicion.md`.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { build } from 'vite';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fudic } from '../src/index.js';
import { runtimeAlias } from './helpers/alias.js';

/** The library's component: one required prop, so the contract is observable. */
const CARD = `@code {
  const { title } = props<{ title: string }>();
}

<head>
  <style>
    .card { border: 1px solid #ccc; }
  </style>
</head>

<ui-card>
  <template shadowrootmode="open">
    <article class="card"><h2>@title</h2><slot></slot></article>
  </template>
</ui-card>
`;

/** The library's `package.json`: `.fud` source in `exports`, no `dist` (SDD-43 §4.1). */
const LIB_PACKAGE = JSON.stringify(
  {
    name: '@acme/ui',
    version: '1.0.0',
    type: 'module',
    files: ['src'],
    exports: { './ui-card.fud': './src/ui-card.fud' },
  },
  null,
  2,
);

const LIB_FUDIC = JSON.stringify({ kind: 'lib', prefix: 'ui' }, null, 2);

const page = (href: string): string => `<!DOCTYPE html>
<html>
  <head>
    <link rel="component" href="${href}">
    <title>Tienda</title>
  </head>
  <body>
    <ui-card .title="Hola">contenido</ui-card>
  </body>
</html>
`;

interface OutFile {
  readonly type: 'chunk' | 'asset';
  readonly fileName: string;
  readonly source?: string;
}

interface Built {
  readonly output?: OutFile[];
  readonly error?: string;
}

/**
 * A workspace with a library and an app, built.
 *
 * `linked` reproduces what pnpm does — `node_modules/@acme/ui` is a symlink to `libs/ui` —
 * and `real` reproduces an ordinary `npm install`, a copy of the package inside
 * `node_modules`. Question 5 of §4.2 is exactly the difference between these two.
 */
async function buildWorkspace(options: {
  readonly href: string;
  readonly linked: boolean;
}): Promise<Built> {
  const ws = mkdtempSync(join(tmpdir(), 'fudic-lib-'));

  const lib = join(ws, 'libs', 'ui');
  mkdirSync(join(lib, 'src'), { recursive: true });
  writeFileSync(join(lib, 'package.json'), LIB_PACKAGE);
  writeFileSync(join(lib, 'fudic.json'), LIB_FUDIC);
  writeFileSync(join(lib, 'src', 'ui-card.fud'), CARD);

  const app = join(ws, 'apps', 'tienda');
  mkdirSync(join(app, 'src', 'routes'), { recursive: true });
  writeFileSync(join(app, 'src', 'routes', 'index.fud'), page(options.href));
  writeFileSync(join(app, 'fudic.json'), JSON.stringify({ kind: 'app', id: 'tienda' }, null, 2));

  // Where the app resolves `@acme/ui` from. Both shapes are real installs, and the point of
  // measuring both is that a symlinked package keeps its files under the workspace root while
  // a copied one does not — which is what the index's `node_modules` prune turns on.
  const installed = join(app, 'node_modules', '@acme');
  mkdirSync(installed, { recursive: true });
  if (options.linked) symlinkSync(lib, join(installed, 'ui'), 'junction');
  else cpSync(lib, join(installed, 'ui'), { recursive: true });

  try {
    const result = (await build({
      root: app,
      logLevel: 'silent',
      resolve: { alias: { ...runtimeAlias } },
      plugins: [fudic()],
      build: { write: false, minify: false },
    })) as unknown as { output: OutFile[] };
    return { output: result.output };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/** The page's HTML, or `''` when the build produced none. */
const html = (built: Built): string =>
  built.output?.find((o) => o.fileName.endsWith('index.html'))?.source ?? '';

/** From `<ws>/apps/tienda/src/routes/index.fud` up to `<ws>/`, then down into the library. */
const RELATIVE = '../../../../libs/ui/src/ui-card.fud';
const BARE = '@acme/ui/ui-card.fud';
/** The same specifier with no npm scope — which is to say, with no leading `@`. */
const BARE_UNSCOPED = 'acme-ui/ui-card.fud';
/** The scoped one written through the grammar's own escape (decision 1): `@@` is a literal `@`. */
const BARE_ESCAPED = '@@acme/ui/ui-card.fud';

let relativeLinked: Built;
let relativeReal: Built;
let bareLinked: Built;
let bareReal: Built;
let bareUnscoped: Built;
let bareEscaped: Built;

beforeAll(async () => {
  relativeLinked = await buildWorkspace({ href: RELATIVE, linked: true });
  relativeReal = await buildWorkspace({ href: RELATIVE, linked: false });
  bareLinked = await buildWorkspace({ href: BARE, linked: true });
  bareReal = await buildWorkspace({ href: BARE, linked: false });
  bareUnscoped = await buildWorkspace({ href: BARE_UNSCOPED, linked: true });
  bareEscaped = await buildWorkspace({ href: BARE_ESCAPED, linked: true });
}, 240000);

describe('SDD-43 §4.2 — a relative href that crosses into another package', () => {
  it('composes the library component (question 1, question 4a)', () => {
    expect(relativeLinked.error).toBeUndefined();
    expect(html(relativeLinked)).toContain('<template shadowrootmode="open"');
    expect(html(relativeLinked)).toContain('Hola');
    expect(html(relativeLinked)).toContain('contenido');
  });

  it('hoists the library stylesheet into the page head', () => {
    expect(html(relativeLinked)).toContain('.card{border:1px solid #ccc;}');
  });

  it('is indifferent to the package being linked or copied (question 5)', () => {
    expect(html(relativeReal)).toContain('<template shadowrootmode="open"');
    expect(html(relativeReal)).toContain('Hola');
  });
});

describe('SDD-43 §4.2 — a bare specifier in an href', () => {
  it.fails('composes the library component when the package is linked (question 4b)', () => {
    expect(bareLinked.error).toBeUndefined();
    expect(html(bareLinked)).toContain('Hola');
  });

  it.fails('composes the library component when the package is copied', () => {
    expect(bareReal.error).toBeUndefined();
    expect(html(bareReal)).toContain('Hola');
  });

  it('an UNSCOPED specifier is joined to the directory as if it were a path', () => {
    // What the author gets today: no package resolution, so the specifier is treated as a
    // relative path and the error names a file that could never exist. This is the message
    // FUD0760 replaces.
    expect(bareUnscoped.error ?? '').toMatch(/apps[\\/]tienda[\\/]src[\\/]routes[\\/]acme-ui/);
  });

  it('a SCOPED specifier loses its scope before anything resolves it', () => {
    // The finding of the measurement, and it is not about resolution at all: `@` opens an
    // `@`-construct in a `.fud`, so `href="@acme/ui/ui-card.fud"` is read as the expression
    // `@acme` followed by the text `/ui/ui-card.fud`. What reaches the resolver is a
    // ROOT-ABSOLUTE `/ui/ui-card.fud`, which is why the error names a file at the root of
    // the drive and never mentions the package. Resolving bare specifiers does not fix this:
    // the string never arrives.
    expect(bareLinked.error ?? '').not.toMatch(/acme/);
    expect(bareLinked.error ?? '').toMatch(/[\\/]ui[\\/]ui-card\.fud/);
  });

  it('the grammar\'s own `@@` escape delivers the scope intact', () => {
    // Which says the parser needs no new rule to carry a scoped specifier — only a decision
    // about whether an author has to write `@@acme/ui` for a package called `@acme/ui`.
    expect(bareEscaped.error ?? '').toMatch(/@acme[\\/]ui[\\/]ui-card\.fud/);
  });
});
