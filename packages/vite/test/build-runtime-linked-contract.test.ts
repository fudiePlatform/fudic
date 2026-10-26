/**
 * A form declared in a `.fudapi` links ONE copy of `@fudic/forms` in the browser (SDD-60 §3.10,
 * SDD-45 §4.3).
 *
 * The generated module builds its form with `formOf` from `@fudic/forms/contract`, its fields
 * with `str` and the rest, and the binders of the page come from the published pieces. When the
 * contract had no piece of its own, `formOf` was bundled from `dist` and brought its own
 * `form.ts` and `internals.ts`: the binders, linked to the published `internals`, looked a field
 * up under a `Symbol` the bundled form never set, and every form of `examples/basic` threw on
 * hydration (`reading 'clone'`). One copy means: the contract arrives by URL, and no file the
 * application emitted carries the internals.
 *
 * Installed, not aliased, for the reason `build-runtime-linked.test.ts` gives: an aliased
 * project has no publisher and links nothing.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { build } from 'vite';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fudic } from '../src/index.js';

const pkgDir = (name: string): string =>
  fileURLToPath(new URL(`../../${name}`, import.meta.url));

const API = `form person
  name  str = ""
    required  "Escribe tu nombre."
`;

const FORM = `<link rel="server" href="./app-person.fudapi">

<app-person>
  <template shadowrootmode="open">
    <form control=@person>
      <input control=@person.name type="text">
      <span error=@person.name></span>
    </form>
  </template>
</app-person>
`;

const PAGE = `<!DOCTYPE html>
<html>
  <head>
    <link rel="component" href="../components/app-person.fud">
    <script src="fudic:runtime"></script>
    <title>Home</title>
  </head>
  <body><app-person></app-person></body>
</html>
`;

interface OutFile {
  readonly type: 'chunk' | 'asset';
  readonly fileName: string;
  readonly code?: string;
  readonly source?: string;
}

let output: OutFile[];

beforeAll(async () => {
  const root = mkdtempSync(join(tmpdir(), 'fudic-linked-contract-'));
  mkdirSync(join(root, 'src', 'components'), { recursive: true });
  mkdirSync(join(root, 'src', 'routes'), { recursive: true });
  writeFileSync(join(root, 'src', 'components', 'app-person.fudapi'), API);
  writeFileSync(join(root, 'src', 'components', 'app-person.fud'), FORM);
  writeFileSync(join(root, 'src', 'routes', 'index.fud'), PAGE);

  const scope = join(root, 'node_modules', '@fudic');
  mkdirSync(scope, { recursive: true });
  const installed = ['core', 'dom', 'ssr', 'transport', 'di', 'forms', 'http'];
  for (const name of installed) {
    symlinkSync(pkgDir(name), join(scope, name), 'junction');
  }
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({
      name: 'linked-contract-app',
      type: 'module',
      dependencies: Object.fromEntries(installed.map((n) => [`@fudic/${n}`, '*'])),
    }),
  );

  const result = (await build({
    root,
    logLevel: 'silent',
    plugins: [fudic({ liveCheck: false })],
    build: { write: false, minify: false },
  })) as unknown as { output: OutFile[] };
  output = result.output;
}, 240000);

const appChunks = (): OutFile[] =>
  output.filter((o) => o.type === 'chunk' && !o.fileName.startsWith('_fudic/') && !o.fileName.startsWith('sw/'));

describe('a .fudapi form in the browser', () => {
  it('builds its form with the published contract piece', () => {
    const code = appChunks().map((o) => o.code ?? '').join('\n');
    expect(code).toMatch(/import\s*\{[^}]*\bformOf\b[^}]*\}\s*from\s*["']\/_fudic\/[^"']+\/forms\/contract\.js["']/u);
  });

  it('carries no copy of the forms internals in what the application emitted', () => {
    for (const chunk of appChunks()) {
      expect(chunk.code, chunk.fileName).not.toContain('fud.node');
    }
  });

  it('copies the contract piece, which takes the internals from their own piece', () => {
    const contract = output.find((o) => /^_fudic\/[^/]+\/forms\/contract\.js$/u.test(o.fileName));
    expect(contract).toBeDefined();
    expect(String(contract!.code ?? contract!.source)).not.toContain('fud.node');
  });
});
