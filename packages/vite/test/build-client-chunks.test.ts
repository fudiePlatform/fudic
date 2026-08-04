/**
 * SDD-15 §6.8, in a real `vite build`: every component of the graph leaves a client chunk
 * in the output, and nothing else does.
 *
 * This is the criterion that cannot be checked on the emitted text. A chunk that never
 * reaches the bundler is a chunk whose `import`, whose TypeScript and whose asset reference
 * nobody ever validated — and the whole point of emitting them before the linking stage
 * exists is that a broken one fails HERE, at build time, instead of at hydration.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { build } from 'vite';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fudic } from '../src/index.js';

const ssrDist = fileURLToPath(new URL('../../ssr/dist/index.js', import.meta.url));
const transportDist = fileURLToPath(new URL('../../transport/dist/index.js', import.meta.url));
const coreDist = fileURLToPath(new URL('../../core/dist/index.js', import.meta.url));
const domDist = fileURLToPath(new URL('../../dom/dist/index.js', import.meta.url));

/** A component whose `@code { @client }` region is TypeScript, as the grammar allows. */
const BUTTON = `@code {
  type Variant = 'primary' | 'ghost';

  const { variant = 'primary' } = props<{ variant?: Variant }>();

  @client {
    function onClick(e: MouseEvent): void {
      (e.currentTarget as HTMLElement).dispatchEvent(new CustomEvent('press'));
    }
  }
}

<app-button>
  <template shadowrootmode="open">
    <button class="btn" class:ghost="@(variant === 'ghost')" @click="@onClick"><slot></slot></button>
  </template>
</app-button>
`;

const CARD = `<link rel="component" href="./app-button.fud">

@code {
  const { title } = props<{ title: string }>();
}

<app-card>
  <template shadowrootmode="open">
    <article><h2>@title</h2><app-button>ok</app-button></article>
  </template>
</app-card>
`;

const PAGE = `<!DOCTYPE html>
<html>
  <head>
    <link rel="component" href="../components/app-card.fud">
    <title>Home</title>
  </head>
  <body>
    <app-card title="Hola"></app-card>
  </body>
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
  const root = mkdtempSync(join(tmpdir(), 'fudic-hydrate-'));
  mkdirSync(join(root, 'components'), { recursive: true });
  mkdirSync(join(root, 'routes'), { recursive: true });
  writeFileSync(join(root, 'components', 'app-button.fud'), BUTTON);
  writeFileSync(join(root, 'components', 'app-card.fud'), CARD);
  writeFileSync(join(root, 'routes', 'index.fud'), PAGE);

  const result = (await build({
    root,
    logLevel: 'silent',
    resolve: {
      alias: {
        '@fudic/ssr': ssrDist,
        '@fudic/transport': transportDist,
        '@fudic/core': coreDist,
        '@fudic/dom': domDist,
      },
    },
    plugins: [fudic()],
    build: { write: false, minify: false },
  })) as unknown as { output: OutFile[] };
  output = result.output;
}, 120000);

const clientChunks = (): OutFile[] => output.filter((o) => o.fileName.startsWith('assets/h/'));

describe('the client chunks in the build output', () => {
  it('emits one per component of the graph, and only for components', () => {
    // app-card is linked by the page, app-button only by app-card: reachability is the
    // graph, not the directory. The page itself gets none — a page is rendered, not
    // hydrated.
    const named = clientChunks().map((o) => o.fileName.replace(/-[A-Za-z0-9_-]{8}\.js$/u, ''));
    expect(named.sort()).toEqual(['assets/h/app-button', 'assets/h/app-card']);
  });

  it('carries the factory and the define of its own component', () => {
    for (const chunk of clientChunks()) {
      const tag = /assets\/h\/([a-z-]+)-/u.exec(chunk.fileName)![1]!;
      expect(chunk.code).toContain(`customElements.define("${tag}"`);
      expect(chunk.code).toContain('static c(');
      expect(chunk.code).toContain('firstElementChild'); // the adopt path came with it
    }
  });

  it('shares one FudicElement, instead of a copy per chunk', () => {
    // §3.7's packaging note, and Rollup does it on its own: the base is a real import, so
    // it splits out and every chunk resolves against a module the page already evaluated.
    for (const chunk of clientChunks()) {
      expect(chunk.code).toMatch(/^import\s*\{[^}]*\}\s*from\s*"\.\.\/[^"]+\.js"/mu);
      expect(chunk.code).not.toContain('class FudicElement');
    }
  });

  it('parses as JavaScript, TypeScript region and all', () => {
    // `app-button` writes its `@client` region in TS (`e: MouseEvent`), and the chunk went
    // through the bundler without a parse error. That is the whole reason these files are
    // emitted before anything links them: a chunk the bundler never saw is a chunk whose
    // types, imports and assets nobody checked.
    const button = clientChunks().find((o) => o.fileName.includes('app-button'))!;
    expect(button.code).not.toContain('MouseEvent');
    expect(button.code).not.toContain('@code');
  });

  it('adds to the render output instead of replacing any of it', () => {
    // The client chunk is an ADDITION. The page is still prerendered from the server
    // modules, with its DSD in place — which is what these chunks will later adopt.
    const html = output.find((o) => o.fileName === 'index.html');
    expect(html).toBeDefined();
    expect(String(html!.source)).toContain('shadowrootmode');
    // And since SDD-27 §5.1 there is no `page` chunk left to replace anything: with no
    // Service Worker this project publishes prerendered HTML and hydration chunks, and
    // nothing else — `ssr` is served from `.fudic/edge`, outside the output.
    expect(output.some((o) => /^assets\/c\//u.test(o.fileName))).toBe(false);
  });
});
