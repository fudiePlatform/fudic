/**
 * SDD-39 §6.14 — the chunk of a route is named, published and shared by every URL of it.
 *
 * `safeName(pattern)` is what names it, and it is BY PATTERN: `/blog/uno` and `/blog/dos` are
 * the same route, the same chunk and the same name. The page states that name in `fud-route`,
 * and the runtime derives the URL from it with the arithmetic a tag already goes through —
 * there is no name→URL table and there is not going to be one.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { build } from 'vite';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fudic } from '../src/index.js';
import { runtimeAlias } from './helpers/alias.js';

/** A parameterised route with a client half: one chunk, many URLs. */
const BLOG = `<!DOCTYPE html>
<html>
<head>
@code {
  @server {
    export function load(ctx) { return { slug: ctx.params.slug }; }
    export function paths() { return ['uno', 'dos']; }
  }
  @client {
    import { signal } from '@fudic/core';

    const abierto = signal(false);
    const alterna = () => abierto.set(!abierto());
  }
}
<title>Blog</title>
</head>
<body>
  <button @click=@alterna()>@abierto()</button>
</body>
</html>
`;

/** A route with no client half at all: the base case, and it costs nothing. */
const ESTATICA = `<!DOCTYPE html>
<html>
<head><title>Estática</title></head>
<body><h1>sin javascript</h1></body>
</html>
`;

interface OutFile {
  readonly type: 'chunk' | 'asset';
  readonly fileName: string;
  readonly code?: string;
  readonly source?: string | Uint8Array;
}

const textOf = (file: OutFile): string =>
  file.code ?? (typeof file.source === 'string' ? file.source : '');

const htmlOf = (files: OutFile[], path: string): string =>
  textOf(files.find((o) => o.fileName === path)!);

/** The content of one JSON block of a prerendered page. */
function blockOf(html: string, id: string): string | null {
  const open = html.indexOf(`id="${id}"`);
  if (open === -1) return null;
  const start = html.indexOf('>', open) + 1;
  return html.slice(start, html.indexOf('</script>', start));
}

async function buildRoot(): Promise<OutFile[]> {
  const root = mkdtempSync(join(tmpdir(), 'fudic-routechunk-'));
  mkdirSync(join(root, 'src', 'routes', 'blog'), { recursive: true });
  writeFileSync(join(root, 'src', 'routes', 'blog', '[slug].fud'), BLOG);
  writeFileSync(join(root, 'src', 'routes', 'estatica.fud'), ESTATICA);
  const result = (await build({
    root,
    logLevel: 'silent',
    resolve: { alias: { ...runtimeAlias } },
    plugins: [fudic()],
    build: { write: false, minify: false },
  })) as unknown as { output: OutFile[] };
  return result.output;
}

describe('the chunk of a route, named and discovered (§6.14)', () => {
  let output: OutFile[];

  beforeAll(async () => {
    output = await buildRoot();
  }, 300000);

  it('is emitted as `assets/h/blog-slug-<build>.js`, beside the component chunks', () => {
    const chunks = output.filter((o) => o.fileName.startsWith('assets/h/'));
    expect(chunks.map((c) => c.fileName)).toContainEqual(expect.stringMatching(/^assets\/h\/blog-slug-.{8}\.js$/u));
  });

  it('and both URLs of the route publish the SAME name', () => {
    for (const url of ['blog/uno/index.html', 'blog/dos/index.html']) {
      expect(blockOf(htmlOf(output, url), 'fud-route')).toBe('"blog-slug"');
    }
  });

  it('the `<body>` of each carries an id, and it is the highest of its page', () => {
    const html = htmlOf(output, 'blog/uno/index.html');
    expect(html).toMatch(/<body data-fud-id="\d+">/u);
  });

  it('a route with no client half publishes nothing and gets no chunk', () => {
    const html = htmlOf(output, 'estatica/index.html');
    expect(html).not.toContain('data-fud-id');
    expect(blockOf(html, 'fud-route')).toBeNull();
    expect(output.some((o) => o.fileName.startsWith('assets/h/estatica-'))).toBe(false);
  });

  it('`fud-data` carries only the root the client half reads', () => {
    // `load` returns `{ slug }` and `@client` never names `data`, so there is no block: a
    // `data` only the server paints does not cost a byte (§4.8).
    expect(blockOf(htmlOf(output, 'blog/uno/index.html'), 'fud-data')).toBeNull();
  });
});

describe('two files that would be written to one name (FUD0622, §3.5)', () => {
  it('fails the build instead of overwriting one chunk with the other', async () => {
    // `/app/card` → `safeName` → `app-card`, which is also a component of the build. A
    // pattern does not normally produce a valid tag, but «normally» is not a guarantee, and
    // the silent outcome is a page that hydrates as some other file.
    const root = mkdtempSync(join(tmpdir(), 'fudic-routecol-'));
    mkdirSync(join(root, 'src', 'routes', 'app'), { recursive: true });
    mkdirSync(join(root, 'src', 'components'), { recursive: true });
    writeFileSync(
      join(root, 'src', 'components', 'app-card.fud'),
      '<app-card><template shadowrootmode="open"><p>card</p></template></app-card>\n',
    );
    writeFileSync(
      join(root, 'src', 'routes', 'app', 'card.fud'),
      [
        '<!DOCTYPE html><html><head>',
        '<link rel="component" href="../../components/app-card.fud">',
        '@code { @client { import { signal } from "@fudic/core"; const n = signal(1); } }',
        '</head><body><app-card></app-card><output>@n()</output></body></html>',
      ].join('\n'),
    );

    await expect(
      build({
        root,
        logLevel: 'silent',
        resolve: { alias: { ...runtimeAlias } },
        plugins: [fudic()],
        build: { write: false, minify: false },
      }),
    ).rejects.toThrow(/FUD0622/u);
  }, 300000);
});
