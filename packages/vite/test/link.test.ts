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
      { sourcemap: true },
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
      { sourcemap: false },
    );
    expect(empty.chunks).toEqual([]);
    expect(empty.entries.size).toBe(0);
  });
});
