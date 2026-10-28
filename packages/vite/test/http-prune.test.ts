/**
 * SDD-67 §4.4 and criterion 13 — a page bundles only the codec its functions speak, and only the
 * validators its rules use. Two real `vite build`s: one app whose functions are all binary and
 * have no rules, one whose functions are all `use json` and have one rule.
 *
 * Each codec is found in the client output by a message only it writes: `binary body:` is the
 * binary reader's, `the body is not valid JSON` the JSON one's; a validator, by the error it
 * leaves (`minLength:`, `maxLength:`).
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { build } from 'vite';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fudic } from '../src/index.js';
import { httpAlias, writeHttpTypecheckConfig } from './helpers/http-project.js';

const PACKAGES = { http: fileURLToPath(new URL('../../http', import.meta.url)), forms: fileURLToPath(new URL('../../forms', import.meta.url)) };

/** A page that calls `search` on a click, so its stub is in the client. */
const PAGE = `<!DOCTYPE html>
<html>
<head>
<title>Usuarios</title>
<link rel="server" href="./usuarios.fudapi">
@code {
  function find(): void {
    void search({ q: 'a' });
  }
}
</head>
<body><button @click=@find>buscar</button></body>
</html>
`;

const SERVER = `import { search } from 'fudic:routes/usuarios';
search.handle((ctx) => [ctx.args.q]);
`;

const BINARY_API = `get search
  q  str
  -> str[]
`;

const JSON_API = `get search
  use json
  q  str
    max-length 80
  -> str[]
`;

function project(api: string): string {
  const root = mkdtempSync(join(tmpdir(), 'fudic-http-prune-'));
  writeHttpTypecheckConfig(root, { module: 'esnext', moduleResolution: 'bundler', verbatimModuleSyntax: true });
  const files: Record<string, string> = {
    'src/routes/usuarios.fud': PAGE,
    'src/routes/usuarios.fudapi': api,
    'src/server/usuarios.ts': SERVER,
    'sw.json': JSON.stringify({ shell: [] }),
    'fudic.json': JSON.stringify({ id: 'prune' }),
  };
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  // `use json` is a middleware of @fudic/http, `max-length` a rule of @fudic/forms: the index reads
  // both from the installed packages.
  writeFileSync(join(root, 'package.json'), JSON.stringify({ dependencies: { '@fudic/http': '0.0.0', '@fudic/forms': '0.0.0' } }));
  mkdirSync(join(root, 'node_modules', '@fudic'), { recursive: true });
  for (const [name, path] of Object.entries(PACKAGES)) symlinkSync(path, join(root, 'node_modules', '@fudic', name), 'junction');
  return root;
}

function filesUnder(dir: string): { path: string; text: string }[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [{ path, text: readFileSync(path, 'utf8') }];
  });
}

/** The client output of an app: every script and page `vite build` wrote. */
async function clientOf(api: string): Promise<string> {
  const root = project(api);
  await build({ root, logLevel: 'silent', resolve: { alias: httpAlias }, plugins: [fudic()], build: { minify: false } });
  return filesUnder(join(root, 'dist'))
    .filter((f) => f.path.endsWith('.js') || f.path.endsWith('.html'))
    .map((f) => f.text)
    .join('\n');
}

const BINARY_READER = 'binary body:';
const JSON_CODEC = 'the body is not valid JSON';

let binary: string;
let json: string;

beforeAll(async () => {
  [binary, json] = await Promise.all([clientOf(BINARY_API), clientOf(JSON_API)]);
}, 300000);

describe('criterion 13: what a page bundles', () => {
  it('both apps did put the stub of search in the client', () => {
    for (const out of [binary, json]) expect(out).toMatch(/id: "routes\/usuarios",\s*name: "search"/u);
  });

  it('all its functions binary: the binary codec, and not jsonWire', () => {
    expect(binary).toContain(BINARY_READER);
    expect(binary).not.toContain(JSON_CODEC);
  });

  it('all its functions in JSON: jsonWire, and not the binary reader', () => {
    expect(json).toContain(JSON_CODEC);
    expect(json).not.toContain(BINARY_READER);
  });

  it('without rules no validator; with max-length, that one and not minLength', () => {
    expect(binary).not.toContain('minLength:');
    expect(binary).not.toContain('maxLength:');
    expect(json).toContain('maxLength:');
    expect(json).not.toContain('minLength:');
  });
});
