/**
 * A project's PUBLIC files: the ones whose URL the author chooses.
 *
 * There are two ways to name a file of your own and they had nothing in common. A relative
 * `./logo.svg` was owned by the framework end to end — hashed, published, checked, and in
 * the shell. A root-absolute `/logo.svg` was waved through as "already a final URL": not
 * checked, so a typo was a 404 nobody reported; not known to the build, so the Service
 * Worker never heard of the file and it had to be repeated by hand in `sw.json`; and not
 * given the base, so the same link was broken under `base: '/admin/'`.
 *
 * Now both are answered by the host, and the difference between them is only WHO chooses
 * the URL. Which is the one thing a developer actually knows about a file.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { build } from 'vite';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fudic } from '../src/index.js';
import { runtimeAlias } from './helpers/alias.js';

const LAYOUT = `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <link rel="icon" href="/logo.svg">
    @RenderHead()
  </head>
  <body><main>@RenderBody()</main><script src="/probe.js"></script></body>
</html>
`;

const ROUTE = `<link rel="layout" href="../layouts/_layout.fud">
<head><title>Inicio</title></head>
<h1>Inicio</h1>
`;

interface OutFile {
  readonly type: 'chunk' | 'asset';
  readonly fileName: string;
  readonly code?: string;
  readonly source?: string | Uint8Array;
}

interface Built {
  readonly output: OutFile[];
  readonly warnings: readonly string[];
}

async function buildProject(
  options: { readonly base?: string; readonly icon?: string } = {},
): Promise<Built> {
  const root = mkdtempSync(join(tmpdir(), 'fudic-public-'));
  for (const dir of ['routes', 'layouts']) {
    mkdirSync(join(root, 'src', dir), { recursive: true });
  }
  mkdirSync(join(root, 'public'), { recursive: true });
  writeFileSync(join(root, 'src', 'routes', 'index.fud'), ROUTE);
  writeFileSync(
    join(root, 'src', 'layouts', '_layout.fud'),
    options.icon === undefined ? LAYOUT : LAYOUT.replace('/logo.svg', options.icon),
  );
  writeFileSync(join(root, 'public', 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  writeFileSync(join(root, 'public', 'probe.js'), 'console.log("probe");\n');
  writeFileSync(join(root, 'sw.json'), JSON.stringify({ shell: [] }));
  writeFileSync(join(root, 'fudic.json'), JSON.stringify({ id: 'test' }));
  const warnings: string[] = [];
  const result = (await build({
    root,
    ...(options.base === undefined ? {} : { base: options.base }),
    logLevel: 'silent',
    resolve: { alias: { ...runtimeAlias } },
    plugins: [fudic()],
    build: {
      write: false,
      minify: false,
      rollupOptions: { onwarn: (w: { message: string }) => warnings.push(w.message) },
    },
  })) as unknown as { output: OutFile[] };
  return { output: result.output, warnings };
}

const htmlOf = (built: Built): string =>
  String(built.output.find((o) => o.fileName === 'index.html')!.source);

/**
 * The URLs the worker precaches at install.
 *
 * Read from the list rather than by searching the whole file, and that is not tidiness: a
 * `not.toContain` over the worker's entire source passes for the wrong reason the moment
 * the string appears anywhere else in it — or, as happened first, when the worker is an
 * asset and `.code` is read as the string "undefined".
 */
const precachedBy = (built: Built): readonly string[] => {
  const sw = built.output.find((o) => o.fileName === 'fudic-sw.js')!;
  const text = sw.code ?? String(sw.source);
  // Located by a URL that is always in it rather than by the name of its binding: the
  // nested build renames every local, so `SHELL` is not in the output (BUG-05 §4.4).
  const anchor = text.indexOf('/fudic-boot-');
  expect(anchor, 'the worker precaches the boot entry').toBeGreaterThan(0);
  const open = text.lastIndexOf('[', anchor);
  const close = text.indexOf(']', anchor);
  expect(open, 'the precache list is an array literal').toBeGreaterThan(0);
  return [...text.slice(open, close).matchAll(/[`"']([^`"']*)[`"']/gu)].map((m) => m[1]!);
};

describe('vite build — a public file named by its own URL', () => {
  let built: Built;

  beforeAll(async () => {
    built = await buildProject();
  }, 180000);

  it('keeps the URL the author wrote: public means the author owns the name', () => {
    // No hash, nothing published: the file is already at its URL, which is the whole
    // reason it is public.
    expect(htmlOf(built)).toContain('<link rel="icon" href="/logo.svg">');
    expect(built.output.some((o) => /^assets\/logo-/u.test(o.fileName))).toBe(false);
  });

  it('precaches it, because a <head> links it — `sw.json` says nothing', () => {
    // This is what `shell: ["/logo.svg"]` used to be for, written by hand, next to a
    // hashed name the same developer could not have predicted.
    expect(precachedBy(built)).toContain('/logo.svg');
  });

  it('leaves a public file the markup references to the runtime cache', () => {
    expect(htmlOf(built)).toContain('<script src="/probe.js">');
    expect(precachedBy(built)).not.toContain('/probe.js');
  });
});

describe('vite build — what used to be silent', () => {
  it('FUD0363: a public file that is not there is reported, not shipped as a 404', async () => {
    const built = await buildProject({ icon: '/missing.svg' });
    expect(built.warnings.some((w) => w.includes('FUD0363') && w.includes('missing.svg'))).toBe(
      true,
    );
  }, 180000);

  it('FUD0366: reaching into public/ by a relative path stops the build', async () => {
    // The form that gets tried when `/logo.svg` seems not to work. It asks for both naming
    // schemes at once and gets the worse half of each, so it is an error and the message
    // names the one URL that was meant.
    await expect(buildProject({ icon: '../../public/logo.svg' })).rejects.toThrow(
      /FUD0366[\s\S]*"\/logo\.svg"/u,
    );
  }, 180000);

  it('carries the base, so the link is not broken under a subdirectory', async () => {
    // `/logo.svg` means "the root of MY app". Under `base: '/admin/'` that is
    // `/admin/logo.svg`, and it used to be written out untouched — a 404 in exactly the
    // deployment that is hardest to test.
    const built = await buildProject({ base: '/admin/' });
    expect(htmlOf(built)).toContain('<link rel="icon" href="/admin/logo.svg">');
    expect(precachedBy(built)).toContain('/admin/logo.svg');
  }, 180000);
});
