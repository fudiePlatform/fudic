/**
 * The link pass (SDD-20 §4.3, rewired by BUG-02 §4.6.1). Its selection used to be
 * `mode === 'sw'`, which left every prerendered route without a chunk and forced the
 * Service Worker to download an HTML file per route. It now selects by CAPABILITY —
 * `isLinkable` — and the two consumers of that predicate, here and the manifest, are
 * the same function so the manifest can never promise a chunk nobody built.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLinker, type ModuleExports } from '@fudic/transport';
import * as ssr from '@fudic/ssr';
import { runLinkPass, safeName, type LinkResult } from '../src/link.js';
import { isLinkable, type ModeDecision } from '../src/mode.js';
import { type RouteBuild } from '../src/discover.js';
import { NO_STRATEGY } from '../src/strategy.js';
import { nodeIo } from '../src/io.js';

/** A page that pulls in a SHARED component, so the pass has a real dep graph. */
const PAGE = (title: string): string => `<!DOCTYPE html>
<html>
  <head>
    <link rel="component" href="../components/app-badge.fud">
    <title>${title}</title>
  </head>
  <body>
    <h1>${title}</h1>
    <app-badge>ok</app-badge>
  </body>
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

let root = '';

function routeBuild(pattern: string, file: string, decision: ModeDecision): RouteBuild {
  return {
    route: { file, pattern, params: pattern.includes(':') ? ['id'] : [] },
    absPath: join(root, 'routes', file),
    analysis: {
      role: 'page' as const,
      isPage: true,
      hasLoad: false,
      hasPaths: false,
      strategy: NO_STRATEGY,
    },
    decision,
  };
}

const mode = (
  m: ModeDecision['mode'],
  over: Partial<ModeDecision> = {},
): ModeDecision => ({ mode: m, prerender: false, enumerate: false, prerenderedHtml: false, ...over });

/**
 * Everything the Service Worker does with a chunk, done here: link its deps in
 * topological order, then run `render`.
 *
 * This is not a shape check. `exports.render` matching a regex proves nothing about a
 * minified chunk — the linker EVALUATES the code with `new Function`, and what has to
 * survive is the CJS interface (`exports`, `require`, the entry's named exports under
 * `preserveEntrySignatures: 'strict'`) plus whatever the page renders. So it is linked,
 * run, and the HTML compared (BUG-06 §4.3, §6.2).
 *
 * `@fudic/ssr` is injected as a linker builtin, exactly as the worker does: it is
 * bundled INSIDE the worker so a chunk never downloads its own copy.
 */
async function renderThroughLinker(result: LinkResult, pattern: string): Promise<string> {
  const codeOf = new Map(result.chunks.map((c) => [`/${c.fileName}`, c.code]));
  const linker = createLinker({
    fetchSource: (url: string) => Promise.resolve(codeOf.get(url) ?? ''),
    builtins: { '@fudic/ssr': ssr as unknown as ModuleExports },
  });
  const entry = `/${result.entries.get(pattern)!}`;
  const deps = (result.deps.get(pattern) ?? []).map((dep) => `/${dep}`);
  const exports = await linker.link(entry, deps);
  const render = exports['render'] as (ctx: unknown) => ReadableStream<Uint8Array>;
  return new Response(render({})).text();
}

describe('isLinkable — what the Service Worker may render', () => {
  it('links a prerendered route: `ssg` is a build fact, not a client one', () => {
    expect(isLinkable(mode('ssg', { prerender: true, prerenderedHtml: true }))).toBe(true);
  });

  it('links a plain `sw` route', () => {
    expect(isLinkable(mode('sw'))).toBe(true);
  });

  it('never links `ssr` or an excluded route', () => {
    expect(isLinkable(mode('ssr'))).toBe(false);
    expect(isLinkable(mode('excluded'))).toBe(false);
  });

  it('never links an ENUMERATED `ssg`: that is paramFallback "notFound"', () => {
    // An enumerated route with `lazy` is `sw`. `ssg` + `enumerate` says ids outside
    // paths() are a 404, and the SW cannot tell one from the other.
    expect(isLinkable(mode('ssg', { prerender: true, enumerate: true, prerenderedHtml: true }))).toBe(false);
  });
});

describe('runLinkPass', () => {
  let result: LinkResult;

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'fudic-link-'));
    mkdirSync(join(root, 'routes'), { recursive: true });
    mkdirSync(join(root, 'components'), { recursive: true });
    writeFileSync(join(root, 'routes', 'about.fud'), PAGE('About'));
    writeFileSync(join(root, 'routes', 'now.fud'), PAGE('Now'));
    writeFileSync(join(root, 'routes', 'account.fud'), PAGE('Account'));
    writeFileSync(join(root, 'components', 'app-badge.fud'), BADGE);
    result = await runLinkPass(
      root,
      '/',
      [
        routeBuild('/about', 'about.fud', mode('ssg', { prerender: true, prerenderedHtml: true })),
        routeBuild('/now', 'now.fud', mode('sw')),
        routeBuild('/account', 'account.fud', mode('ssr')),
      ],
      nodeIo(),
      { sourcemap: true, minify: false },
    );
  }, 180000);

  it('BUG-02 §4.6.1 gives a prerendered route an entry chunk of its own', () => {
    const entry = result.entries.get('/about');
    expect(entry).toBeDefined();
    expect(entry).toContain(`sw/c/${safeName('/about')}-`);
    expect(result.chunks.some((c) => c.fileName === entry)).toBe(true);
  });

  it('emits its deps first, in topological order, and never itself', () => {
    const entry = result.entries.get('/about')!;
    const deps = result.deps.get('/about') ?? [];
    // The shared component became its own chunk: `require` is synchronous, so a chunk's
    // imports must be loaded before it.
    expect(deps.length).toBeGreaterThan(0);
    expect(deps).not.toContain(entry);
    for (const dep of deps) {
      expect(result.chunks.some((c) => c.fileName === dep)).toBe(true);
    }
  });

  it('emits chunks in the exports/require shape the SW linker evaluates', () => {
    const entry = result.chunks.find((c) => c.fileName === result.entries.get('/about'));
    expect(entry!.code).toMatch(/exports\.render\s*=/u);
    // `@fudic/ssr` stays external: it is bundled INTO the worker and injected as a builtin.
    expect(entry!.code).toMatch(/require\(["']@fudic\/ssr["']\)/u);
  });

  it('BUG-06 §6.2 a chunk of the pass links and renders through the SW linker', async () => {
    // The baseline: what unminified output renders. Minifying may not change one byte
    // of it — that is the whole risk of BUG-06 and the reason it is a criterion.
    const html = await renderThroughLinker(result, '/about');
    expect(html).toContain('<app-badge data-fud-adopt="app-badge">');
    expect(html).toContain('<template shadowrootmode="open"');
    expect(html).toContain('<h1>About</h1>');
  });

  it('BUG-06 §6.2 a MINIFIED chunk links and renders exactly the same HTML', async () => {
    // The criterion that justifies the whole BUG. A minifier renames locals, and the
    // linker reaches `render` as a property of `exports` — but that is an argument, and
    // an argument is not a test. This runs the pass again with minification on, links the
    // result by hand and compares the bytes it renders against the baseline above.
    const minified = await runLinkPass(
      root,
      '/',
      [routeBuild('/about', 'about.fud', mode('ssg', { prerender: true, prerenderedHtml: true }))],
      nodeIo(),
      { sourcemap: false, minify: 'oxc' },
    );
    const entryOf = (r: LinkResult): string =>
      r.chunks.find((c) => c.fileName === r.entries.get('/about'))!.code;
    // It really is minified. Measured, not pattern-matched: the compiled page carries the
    // style-adoption polyfill inside a template literal, and no JS minifier goes in there
    // (BUG-07, BUG-08) — so the unminified SHAPES survive minification and only the size
    // separates the two.
    expect(entryOf(minified).length).toBeLessThan(entryOf(result).length);
    expect(await renderThroughLinker(minified, '/about')).toBe(
      await renderThroughLinker(result, '/about'),
    );
  }, 180000);

  it('produces nothing at all for an `ssr` route', () => {
    expect(result.entries.has('/account')).toBe(false);
    expect(result.deps.has('/account')).toBe(false);
  });

  it('returns the empty result when no route is linkable', async () => {
    const empty = await runLinkPass(
      root,
      '/',
      [routeBuild('/account', 'account.fud', mode('ssr'))],
      nodeIo(),
      { sourcemap: false, minify: false },
    );
    expect(empty.chunks).toEqual([]);
    expect(empty.entries.size).toBe(0);
  });
});
