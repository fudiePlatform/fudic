/**
 * SDD-64 §3.4 and §4.4 — `fudic({ sourceLocations: true })` stamps every element with the place
 * of its tag, named relative to the project root with '/': a component of the project by its
 * path under `src/`, one of a sibling library of the workspace with `../`. Only `vite dev`: off
 * by default, and the build never carries it.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type ViteDevServer } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';
import { fudic } from '../src/index.js';
import type { FudicOptions } from '../src/options.js';

/** A workspace: the app at `app/`, a library beside it at `libs/ui/`. */
function workspace(): { root: string; card: string; badge: string } {
  const base = mkdtempSync(join(tmpdir(), 'fudic-source-locations-'));
  const root = join(base, 'app');
  mkdirSync(join(root, 'src', 'components'), { recursive: true });
  mkdirSync(join(base, 'libs', 'ui'), { recursive: true });
  const badge = join(base, 'libs', 'ui', 'ui-badge.fud');
  writeFileSync(badge, '<ui-badge>\n  <template shadowrootmode="open">\n    <span><slot></slot></span>\n  </template>\n</ui-badge>\n');
  const card = join(root, 'src', 'components', 'app-card.fud');
  writeFileSync(
    card,
    '<link rel="component" href="../../../libs/ui/ui-badge.fud">\n\n' +
      '<app-card>\n  <template shadowrootmode="open">\n    <article>\n      <ui-badge>new</ui-badge>\n    </article>\n  </template>\n</app-card>\n',
  );
  return { root, card, badge };
}

let server: ViteDevServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

/** The SSR module `vite dev` serves for `file`. */
async function served(root: string, file: string, options: FudicOptions): Promise<string> {
  server = await createServer({
    root,
    logLevel: 'silent',
    configFile: false,
    server: { middlewareMode: true, ws: false },
    plugins: [fudic({ liveCheck: false, ...options })],
  });
  const result = await server.environments['ssr']!.transformRequest(file);
  return result!.code;
}

const stamps = (code: string) => [...code.matchAll(/"data-fud-src", "([^"]+)"/gu)].map((m) => m[1]);

describe('fudic({ sourceLocations: true }) under vite dev', () => {
  it('a component of the project: each element at its tag, the child host included, relative to the root', async () => {
    const { root, card } = workspace();
    expect(stamps(await served(root, card, { sourceLocations: true }))).toEqual(
      expect.arrayContaining(['src/components/app-card.fud:5:5', 'src/components/app-card.fud:6:7']),
    );
  });

  it('a component of a sibling library: its path from the root, with ../', async () => {
    const { root, badge } = workspace();
    expect(stamps(await served(root, badge, { sourceLocations: true }))).toEqual(['../libs/ui/ui-badge.fud:3:5', '../libs/ui/ui-badge.fud:3:11']);
  });

  it('an element of a snippet of another file: at its tag, in that file', async () => {
    const { root } = workspace();
    writeFileSync(join(root, 'src', 'components', 'helpers.fud'), '@snippet badge(text: string) {\n  <mark>@text</mark>\n}\n');
    const user = join(root, 'src', 'components', 'app-note.fud');
    writeFileSync(
      user,
      '<link rel="snippet" href="./helpers.fud">\n\n<app-note>\n  <template shadowrootmode="open">\n    @render badge("hi")\n  </template>\n</app-note>\n',
    );
    expect(stamps(await served(root, user, { sourceLocations: true }))).toEqual(['src/components/helpers.fud:2:3']);
  });

  it('off by default: nothing is stamped', async () => {
    const { root, card } = workspace();
    expect(await served(root, card, {})).not.toContain('data-fud-src');
  });
});
