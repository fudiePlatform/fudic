/**
 * SDD-45 §4.2 and criterion 10, in a real `vite build`: the application LINKS the published
 * runtime instead of compiling it.
 *
 * Every other build test aliases the runtime packages to their `dist` and gives the temp
 * project no `node_modules`, so discovery finds no publisher and the whole of SDD-45 is
 * skipped — which is exactly why this one exists. Here the packages are installed the way a
 * consumer has them, so the pieces are discovered, the shim splits each import across the
 * URLs that answer it, and the copy lands under `_fudic/`.
 *
 * What it holds: not one file of the framework in `assets/`, the URLs carry no `base`, and a
 * piece nothing reaches is not copied. Those are the three halves of the same claim — a
 * `dist` that is deployable on its own and shareable with the next application.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { build } from 'vite';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fudic } from '../src/index.js';

/** The real package directory, which is what `node_modules/<name>` will point at. */
const pkgDir = (name: string): string =>
  fileURLToPath(new URL(`../../${name}`, import.meta.url));

/** A component that hydrates: client code and a hookup, so it claims an id. */
const COUNTER = `@code {
  let n = 0;
  function mas(): void { n += 1; }
}

<app-counter>
  <template shadowrootmode="open">
    <button @click="@mas">+1</button>
  </template>
</app-counter>
`;

/** Hydrated at LOAD: an `effect` does not wait for a gesture (BUG-53 §4.3). */
const TICKER = `@code {
  import { signal, effect } from "@fudic/core";
  const n = signal(0);
  effect(() => {
    const id = setInterval(() => n.set(n() + 1), 1000);
    return () => clearInterval(id);
  });
}

<app-ticker>
  <template shadowrootmode="open">
    <p>@(n())</p>
  </template>
</app-ticker>
`;

const LIVE = `<!DOCTYPE html>
<html>
  <head>
    <link rel="component" href="../components/app-ticker.fud">
    <script src="fudic:runtime"></script>
    <title>Live</title>
  </head>
  <body><app-ticker></app-ticker></body>
</html>
`;

const PAGE = `<!DOCTYPE html>
<html>
  <head>
    <link rel="component" href="../components/app-counter.fud">
    <script src="fudic:runtime"></script>
    <title>Home</title>
  </head>
  <body><app-counter></app-counter></body>
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
  const root = mkdtempSync(join(tmpdir(), 'fudic-linked-'));
  mkdirSync(join(root, 'src', 'components'), { recursive: true });
  mkdirSync(join(root, 'src', 'routes'), { recursive: true });
  writeFileSync(join(root, 'src', 'components', 'app-counter.fud'), COUNTER);
  writeFileSync(join(root, 'src', 'routes', 'index.fud'), PAGE);
  writeFileSync(join(root, 'src', 'components', 'app-ticker.fud'), TICKER);
  writeFileSync(join(root, 'src', 'routes', 'live.fud'), LIVE);

  // Installed, not aliased: discovery walks `node_modules` from the project root, and a
  // publisher is found by its `package.json` — which is the whole of §3.3.
  const scope = join(root, 'node_modules', '@fudic');
  mkdirSync(scope, { recursive: true });
  const installed = ['core', 'dom', 'ssr', 'transport', 'di', 'forms'];
  for (const name of installed) {
    symlinkSync(pkgDir(name), join(scope, name), 'junction');
  }
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({
      name: 'linked-app',
      type: 'module',
      dependencies: Object.fromEntries(installed.map((n) => [`@fudic/${n}`, '*'])),
    }),
  );

  const result = (await build({
    root,
    logLevel: 'silent',
    plugins: [fudic()],
    build: { write: false, minify: false },
  })) as unknown as { output: OutFile[] };
  output = result.output;
}, 240000);

const pieces = (): OutFile[] => output.filter((o) => o.fileName.startsWith('_fudic/'));

describe('a build that links the published runtime', () => {
  it('copies the pieces it reached under `_fudic/<version>-<fingerprint>/<pkg>/`', () => {
    // The path mirrors the URL exactly, which is what makes a `dist` deployable on its own.
    // The fingerprint of the package's bytes rides with the version (BUG-47 §3).
    const js = pieces().filter((o) => o.fileName.endsWith('.js'));
    expect(js.length).toBeGreaterThan(0);
    for (const file of js) {
      expect(file.fileName).toMatch(/^_fudic\/\d+\.\d+\.\d+-[0-9a-f]{8}\/[a-z-]+\/[a-z-]+\.js$/u);
    }
  });

  it('brings each piece’s source map with it', () => {
    // What a browser downloads from `/_fudic/` is minified framework code, and a piece
    // without its map is undebuggable exactly where this framework runs. The piece names it
    // in its last line, so copying one without the other is a 404 in anybody's devtools.
    const js = pieces().filter((o) => o.fileName.endsWith('.js'));
    const maps = new Set(pieces().map((o) => o.fileName));
    for (const file of js) {
      expect(maps.has(`${file.fileName}.map`)).toBe(true);
    }
  });

  it('leaves not one file of the framework in `assets/`', () => {
    // The claim of §4.2, and the only way to see it is on the output: an `assets/` chunk
    // holding `signal` or the hydration capturer is a framework the application compiled.
    const assets = output.filter(
      (o) => o.fileName.startsWith('assets/') && o.fileName.endsWith('.js'),
    );
    for (const chunk of assets) {
      expect(chunk.code).not.toContain('class FudicElement');
      expect(chunk.code).not.toContain('function hydrate');
    }
  });

  it('names the pieces by origin-absolute URL, with no application `base`', () => {
    // A `base` on these URLs is what stops two applications of one origin sharing them
    // (§3.1), and the build most likely to be wrong is the one hardest to test.
    const importers = output.filter((o) => o.type === 'chunk' && o.code !== undefined);
    const urls = importers.flatMap((o) => [...(o.code ?? '').matchAll(/["'`](\/_fudic\/[^"'`]+)/gu)]);
    expect(urls.length).toBeGreaterThan(0);
    for (const [, url] of urls) {
      expect(url).toMatch(/^\/_fudic\//u);
    }
  });

  it('copies every URL a piece names, so the second hop is not a 404', () => {
    // A piece names other pieces by URL (§4.3), and the application never mentions those.
    // Copying only what the application names leaves a `dist` that 404s one hop down.
    const copied = new Set(pieces().map((o) => `/${o.fileName}`));
    for (const file of pieces().filter((o) => o.fileName.endsWith('.js'))) {
      for (const [, url] of (file.code ?? file.source ?? '').matchAll(
        /["'`](\/_fudic\/[^"'`]+\.js)["'`]/gu,
      )) {
        expect(copied.has(url as string)).toBe(true);
      }
    }
  });

  it('does not copy a piece nothing in this application reaches', () => {
    // What makes the prune measurable (criterion 10): this page has no form and no injected
    // service, so the form pieces are not in the output — counted on the `dist`, never
    // deduced from the source.
    const names = pieces().map((o) => o.fileName);
    expect(names.some((n) => n.includes('/forms/'))).toBe(false);
  });

  it('writes the coordinator at the root, and the head names it', () => {
    // Fixed by hand with `fileName` and not left to the default naming, which drops it in
    // `assets/` — a head tag pointing at a file nobody wrote. That happened.
    const coordinator = output.find((o) => /^fudic-main-[^/]+\.js$/u.test(o.fileName));
    expect(coordinator).toBeDefined();
    // And it imports its pieces as URLs rather than carrying them.
    expect(coordinator?.code).toMatch(/from\s*["'`]\/_fudic\//u);
  });

  it('preloads the pieces of the LOAD and not the deferred ones', () => {
    // §4.5: what earns a `<link rel="modulepreload">` is what the coordinator imports
    // statically, because the browser cannot discover those until it has parsed it. The DOM
    // adapter and the signal are asked for dynamically on purpose (§4.4.1), and preloading
    // them would buy back for every page the bytes that phase removed.
    const html = output.find((o) => o.fileName === 'index.html');
    const preloaded = [
      ...String(html?.source ?? '').matchAll(/rel="modulepreload" href="([^"]+)"/gu),
    ].map(([, url]) => url);

    expect(preloaded.length).toBeGreaterThan(0);
    expect(preloaded.some((u) => (u ?? '').includes('/core/hydrate.js'))).toBe(true);
    expect(preloaded.some((u) => (u ?? '').includes('/dom/browser.js'))).toBe(false);
    expect(preloaded.some((u) => (u ?? '').includes('/core/signal.js'))).toBe(false);
  });
});

describe('BUG-53 §4.1: the manifest names the runtime under each hydration chunk', () => {
  it('lists the pieces of `app-counter` with their static closure, every one copied', () => {
    const manifest = output.find((o) => o.fileName === 'fudic-routes.json')!;
    const file = JSON.parse(String(manifest.source)) as { hydrate: Record<string, string[]> };
    const listed = file.hydrate['app-counter']!.filter((d) => d.startsWith('/_fudic/'));
    expect(listed.length).toBeGreaterThan(0);
    const byUrl = new Map(pieces().map((o) => [`/${o.fileName}`, o]));
    for (const url of listed) {
      const piece = byUrl.get(url);
      expect(piece, `${url} is copied`).toBeDefined();
      // Closed: what a listed piece imports statically is listed too.
      for (const [, next] of String(piece!.source ?? piece!.code).matchAll(
        /(?:^|[^.$\w])(?:from|import)\s*["'`](\/_fudic\/[^"'`]+\.js)["'`]/gu,
      )) {
        expect(listed, `${url} → ${next!}`).toContain(next);
      }
    }
  });
});

describe('BUG-53 §4.3: with no worker, the head preloads what the page hydrates at load', () => {
  const html = (name: string): string =>
    String(output.find((o) => o.fileName === name)?.source ?? '');
  const preloads = (name: string): string[] =>
    [...html(name).matchAll(/<link rel="modulepreload" href="([^"]+)">/gu)].map((m) => m[1]!);

  it('names the eager chunk and its whole graph, each once, and nothing for a lazy page', () => {
    const file = JSON.parse(String(output.find((o) => o.fileName === 'fudic-routes.json')!.source)) as {
      build: string;
      hydrate: Record<string, string[]>;
    };
    const live = preloads('live/index.html');
    expect(live).toContain(`/assets/h/app-ticker-${file.build}.js`);
    // Its runtime too, the one the hydration runtime loads on demand included.
    for (const piece of file.hydrate['app-ticker']!.filter((d) => d.startsWith('/_fudic/'))) {
      expect(live).toContain(piece);
    }
    expect(live.some((u) => u.endsWith('/dom/browser.js'))).toBe(true);
    expect(new Set(live).size).toBe(live.length);
    // `app-counter` waits for a gesture: its page preloads the coordinator's closure alone.
    expect(preloads('index.html').some((u) => u.includes('/assets/h/'))).toBe(false);
    expect(html('live/index.html')).not.toContain('__fudic_eager_');
  });
});
