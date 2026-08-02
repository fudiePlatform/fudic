/**
 * BUG-06: the two NESTED builds — the Service Worker's own bundle and the link pass —
 * ignore the host's `build.minify`. They ran with a hardcoded `minify: false` and, even
 * without it, `configResolved` never captured the option: the same hole BUG-05 documented
 * for `sourcemap`, in the same two functions.
 *
 * The point is NOT that the output should be smaller. It is that an option the user
 * configures was ignored in silence, in both directions — the default happened to be
 * wrong, and an explicit `minify: false` happened to be right by accident (§2.5). So the
 * criteria come in pairs: what the default does, and what an explicit `false` does.
 *
 * Note on the symptom: these files are emitted as ASSETS, so `vite build` never prints a
 * `gzip` column for them whether they are minified or not. The proof is the bytes (§1).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { build } from 'vite';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fudic } from '../src/index.js';
import { runtimeAlias } from './helpers/alias.js';
import { BUILD_TOKEN } from '../src/constants.js';
import { decodeMappings } from './helpers/vlq.js';
import { specifiersOf } from './helpers/specifiers.js';


const PAGE = `<!DOCTYPE html>
<html>
<head>
  <link rel="component" href="../components/app-badge.fud">
  <title>Home</title>
</head>
<body><h1>Home</h1><app-badge>ok</app-badge></body>
</html>
`;

const BADGE = `<head>
  <style>.badge { border: 1px solid #ccc; }</style>
</head>

<app-badge>
  <template shadowrootmode="open">
    <span class="badge"><slot></slot></span>
  </template>
</app-badge>
`;

interface OutFile {
  readonly type: 'chunk' | 'asset';
  readonly fileName: string;
  readonly code?: string;
  readonly source?: string | Uint8Array;
}

interface SourceMapV3Like {
  readonly version: number;
  readonly mappings: string;
}

const textOf = (file: OutFile): string =>
  file.code ?? (typeof file.source === 'string' ? file.source : '');

const find = (files: OutFile[], name: string): OutFile | undefined =>
  files.find((o) => o.fileName === name);

/** Every `sw/c/*.js` of an output, excluding the maps themselves. */
const linkChunks = (files: OutFile[]): OutFile[] =>
  files.filter((o) => o.fileName.startsWith('sw/c/') && o.fileName.endsWith('.js'));

function projectRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'fudic-minify-'));
  mkdirSync(join(root, 'routes'), { recursive: true });
  mkdirSync(join(root, 'components'), { recursive: true });
  writeFileSync(join(root, 'routes', 'index.fud'), PAGE);
  writeFileSync(join(root, 'routes', 'about.fud'), PAGE);
  writeFileSync(join(root, 'components', 'app-badge.fud'), BADGE);
  writeFileSync(join(root, 'sw.json'), JSON.stringify({ shell: ['/fudic-main.js'] }));
  return root;
}

/** `minify` and `sourcemap` are left to the caller: the whole BUG is what the host says. */
async function buildRoot(
  root: string,
  options: {
    minify?: boolean | 'oxc' | 'esbuild' | 'terser';
    sourcemap?: boolean | 'inline' | 'hidden';
  } = {},
): Promise<OutFile[]> {
  const result = (await build({
    root,
    logLevel: 'silent',
    resolve: { alias: { ...runtimeAlias } },
    plugins: [fudic()],
    build: {
      write: false,
      ...(options.minify === undefined ? {} : { minify: options.minify }),
      ...(options.sourcemap === undefined ? {} : { sourcemap: options.sourcemap }),
    },
  })) as unknown as { output: OutFile[] };
  return result.output;
}

/** The bytes of every `sw/c/*.js` together: their names are hashed, their total is not. */
const linkChunkBytes = (files: OutFile[]): number =>
  linkChunks(files).reduce((total, chunk) => total + textOf(chunk).length, 0);

/**
 * Why the criterion is SIZE and not a pattern.
 *
 * `//#region` — rolldown's section banner, the first bytes of the broken `fudic-sw.js`
 * in §1 — is a sound negative signal, and it is used below. But no positive pattern is
 * trustworthy on the link chunks: the compiled page carries the style-adoption polyfill
 * and the component CSS inside TEMPLATE LITERALS, which no JS minifier enters by design
 * (BUG-07, BUG-08). Every unminified shape one might grep for — `var tag = `, block
 * indentation — survives minification in there.
 *
 * So the two builds are compared against each other: same tree, same input, `minify`
 * the only difference. That is also the measurement §2.5 says the argument needs.
 */

describe('vite build — a nested build minifies what the host says', () => {
  let output: OutFile[];
  let plain: OutFile[];

  beforeAll(async () => {
    const root = projectRoot();
    // No `minify` at all: Vite's own default (`'oxc'`) is what must reach them. Same
    // tree built twice, so the only difference between the two outputs is the option.
    output = await buildRoot(root);
    plain = await buildRoot(root, { minify: false });
  }, 600000);

  it('§6.1 the Service Worker is minified, and was not before', () => {
    const code = textOf(find(output, 'fudic-sw.js')!);
    expect(code).not.toContain('//#region');
    expect(code.length).toBeLessThan(textOf(find(plain, 'fudic-sw.js')!).length);
  });

  it('§6.1 the linkable chunks are minified, and were not before', () => {
    expect(linkChunks(output).length).toBeGreaterThan(0);
    expect(linkChunks(output)).toHaveLength(linkChunks(plain).length);
    expect(linkChunkBytes(output)).toBeLessThan(linkChunkBytes(plain));
  });

  it('§6.4 no artifact keeps the build token, and the id is still 8 hex digits', () => {
    // A minifier does not touch the contents of a string literal, and the substitution
    // runs AFTER the nested build — but a surviving token means caches called
    // `shell-__FUDIC_BUILD__` that `isStaleCache` never purges, silently and forever
    // (BUG-03 §4.3). Fixed by test, not by reasoning about minifiers.
    for (const file of output) {
      expect(textOf(file)).not.toContain(BUILD_TOKEN);
    }
    const manifest = JSON.parse(textOf(find(output, 'fudic-routes.json')!)) as {
      build: string;
      routes: Array<Record<string, unknown>>;
    };
    expect(manifest.build).toMatch(/^[0-9a-f]{8}$/u);
    // As a literal, under WHICHEVER quote survived: oxc re-quotes strings as template
    // literals, so the id lands in the worker as `` `d4452e96` `` and not `"d4452e96"`.
    // The criterion is that the SW and the manifest name the same caches, not how the
    // minifier spells them — BUG-03 §6.4 could assume double quotes, this cannot.
    expect(textOf(find(output, 'fudic-sw.js')!)).toMatch(
      new RegExp(`["'\`]${manifest.build}["'\`]`, 'u'),
    );
  });

  it('§6.6 the Service Worker still has no imports, and is still called that', () => {
    // BUG-03 §6.1 under new conditions: minification must not reintroduce a script graph
    // the fetch handler cannot see, nor move the file to a hashed name.
    expect(specifiersOf(textOf(find(output, 'fudic-sw.js')!))).toEqual([]);
    expect(output.filter((o) => /^fudic-sw.*\.js$/u.test(o.fileName))).toHaveLength(1);
  });

  it('§6.7 the chunks of `sw/c/` still exist and the manifest still points at them', () => {
    const manifest = JSON.parse(textOf(find(output, 'fudic-routes.json')!)) as {
      routes: Array<Record<string, unknown>>;
    };
    const declared = manifest.routes.map((r) => r['chunk'] as string);
    expect(declared.length).toBeGreaterThan(0);
    for (const chunk of declared) {
      expect(chunk).toMatch(/^\/sw\/c\/.*\.js$/u);
      expect(output.some((o) => `/${o.fileName}` === chunk)).toBe(true);
    }
  });

  it('§6.3 an explicit `minify: false` leaves both outputs unminified', () => {
    // The criterion that makes this "inherit the host's configuration" and not "always
    // minify". It passed before the fix too — by accident, because the value was
    // hardcoded. Now it passes because the option was read.
    expect(textOf(find(plain, 'fudic-sw.js')!)).toContain('//#region');
    expect(linkChunks(plain).length).toBeGreaterThan(0);
    for (const chunk of linkChunks(plain)) {
      expect(textOf(chunk)).toMatch(/\bvar \w+ = /u);
    }
  });
});

describe('vite build — minify and sourcemap together', () => {
  let output: OutFile[];

  beforeAll(async () => {
    // The combination production actually uses, and the one neither BUG tested alone.
    output = await buildRoot(projectRoot(), { sourcemap: true });
  }, 300000);

  it('§6.5 the map of the minified Service Worker describes the code emitted', () => {
    // BUG-05 §6.7, repeated with minification on: every mapping must land inside the
    // bytes that were actually written. `BUILD_TOKEN` is substituted after the nested
    // build, so a token and an id of different lengths would shift every column after it
    // — and now there are far fewer lines for a bad column to hide in.
    const code = textOf(find(output, 'fudic-sw.js')!);
    const map = JSON.parse(textOf(find(output, 'fudic-sw.js.map')!)) as SourceMapV3Like;
    const lines = code.split('\n');
    expect(map.version).toBe(3);
    expect(code).not.toContain('//#region'); // minified, and mapped
    for (const m of decodeMappings(map.mappings)) {
      expect(m.generatedLine).toBeLessThan(lines.length);
      expect(m.generatedColumn).toBeLessThanOrEqual(lines[m.generatedLine]!.length);
    }
  });

  it('§6.5 every minified linkable chunk still has a map that resolves', () => {
    const chunks = linkChunks(output);
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      const code = textOf(chunk);
      const map = JSON.parse(textOf(find(output, `${chunk.fileName}.map`)!)) as SourceMapV3Like;
      const lines = code.split('\n');
      for (const m of decodeMappings(map.mappings)) {
        expect(m.generatedLine).toBeLessThan(lines.length);
        expect(m.generatedColumn).toBeLessThanOrEqual(lines[m.generatedLine]!.length);
      }
    }
  });
});
