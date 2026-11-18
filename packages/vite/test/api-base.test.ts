/**
 * SDD-87 §3.5, task 7: the plugin hands the `base` Vite resolved to the emit of a `.fudapi`. A
 * build with `base: '/admin/'` writes `base: "/admin/"` in the browser chunk of its calls and
 * remote rules; a build without one writes none.
 */

import { describe, expect, it } from 'vitest';
import { build } from 'vite';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fudic } from '../src/index.js';
import { httpAlias, writeHttpTypecheckConfig } from './helpers/http-project.js';

const PAGE_API = `get hola
  -> str

put guarda
  nombre  str
`;

/** The layout every page links (SDD-88): the smallest one, so the body is the page's markup. */
const BARE_LAYOUT = '<!DOCTYPE html>\n<html>\n<head>@RenderHead()</head>\n<body>@RenderBody()</body>\n</html>\n';

const PAGE = `<link rel="layout" href="../layouts/_layout.fud">
<link rel="server" href="./fallos.fudapi">
@code {
  function saluda() {
    void hola();
  }
}
<head><title>Fallos</title></head>
<button @click=@saluda()>hola</button>
`;

const RULES_API = `rule nombre-ocupado
  on field str
  runs remote
  fails nombre-ocupado
`;

const SERVER = `import { hola, guarda } from 'fudic:routes/fallos';
import { nombreOcupado } from 'fudic:rules/nombres';
hola.handle(() => 'hola');
guarda.handle(() => undefined);
nombreOcupado.check((v) => v !== 'admin');
`;

function project(): string {
  const root = mkdtempSync(join(tmpdir(), 'fudic-api-base-'));
  writeHttpTypecheckConfig(root, { module: 'esnext', moduleResolution: 'bundler', verbatimModuleSyntax: true, strict: true });
  const files: Record<string, string> = {
    'src/layouts/_layout.fud': BARE_LAYOUT,
    'src/routes/fallos.fudapi': PAGE_API,
    'src/routes/fallos.fud': PAGE,
    'src/rules/nombres.fudapi': RULES_API,
    'src/server/all.ts': SERVER,
  };
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

function textUnder(dir: string): string {
  return readdirSync(dir)
    .map((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? textUnder(path) : name.endsWith('.js') ? readFileSync(path, 'utf8') : '';
    })
    .join('\n');
}

async function built(base?: string): Promise<string> {
  const root = project();
  await build({
    root,
    ...(base !== undefined ? { base } : {}),
    logLevel: 'silent',
    resolve: { alias: httpAlias },
    plugins: [fudic()],
    build: { minify: false },
  });
  return textUnder(join(root, 'dist/assets'));
}

describe('the plugin passes the base to the emit (task 7)', () => {
  it('a build with base /admin/ writes base: "/admin/" in the browser chunk of the .fudapi', async () => {
    const client = await built('/admin/');
    // Unminified, a stub's object spans several lines: the base is inside the one of `hola`.
    expect(client).toMatch(/stub\(\{[^;]*name: "hola",[^;]*base: "\/admin\/"\n\}\);/u);
  }, 300000);

  it('a build without a base writes none', async () => {
    const client = await built();
    expect(client).toContain('name: "hola"');
    expect(client).not.toMatch(/base: "/u);
  }, 300000);
});
