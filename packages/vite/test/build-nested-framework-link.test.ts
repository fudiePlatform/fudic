/**
 * `FUD0438` in the BUILD — the other half of where it has to be seen.
 *
 * The editor underlines it while it is typed (`language-server`), and this is the build
 * saying the same thing: a `<link rel="component">` written inside a route's `<head>`
 * registers nothing and used to publish the `.fud` it named into the page. An error the
 * editor reports and the build does not is a mistake that ships.
 */

import { describe, it, expect } from 'vitest';
import { build } from 'vite';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fudic } from '../src/index.js';
import { runtimeAlias } from './helpers/alias.js';

const LAYOUT = `<!DOCTYPE html>
<html lang="es">
  <head><meta charset="utf-8">@RenderHead()</head>
  <body><main>@RenderBody()</main></body>
</html>
`;

const HERO =
  '<s-hero><template shadowrootmode="open"><slot></slot></template></s-hero>\n';

/** The mistake: the component link inside the route's own `<head>`. */
const BAD = `<link rel="layout" href="../layouts/_layout.fud">
<head><link rel="component" href="../components/s-hero.fud"><title>Inicio</title></head>
<s-hero></s-hero>
`;

/** The same file with the link where it belongs. */
const GOOD = `<link rel="layout" href="../layouts/_layout.fud">
<link rel="component" href="../components/s-hero.fud">
<head><title>Inicio</title></head>
<s-hero></s-hero>
`;

async function buildRoute(route: string): Promise<{ readonly html: string }> {
  const root = mkdtempSync(join(tmpdir(), 'fudic-nested-link-'));
  for (const dir of ['routes', 'layouts', 'components']) {
    mkdirSync(join(root, 'src', dir), { recursive: true });
  }
  writeFileSync(join(root, 'src', 'routes', 'index.fud'), route);
  writeFileSync(join(root, 'src', 'layouts', '_layout.fud'), LAYOUT);
  writeFileSync(join(root, 'src', 'components', 's-hero.fud'), HERO);
  writeFileSync(join(root, 'sw.json'), JSON.stringify({ shell: [] }));
  writeFileSync(join(root, 'fudic.json'), JSON.stringify({ id: 'test' }));
  const result = (await build({
    root,
    logLevel: 'silent',
    resolve: { alias: { ...runtimeAlias } },
    plugins: [fudic()],
    build: { write: false, minify: false },
  })) as unknown as { output: Array<{ fileName: string; source?: unknown }> };
  const page = result.output.find((o) => o.fileName === 'index.html');
  return { html: String(page?.source ?? '') };
}

describe('vite build — a framework link below the top level', () => {
  it('stops the build, naming the code', async () => {
    await expect(buildRoute(BAD)).rejects.toThrow(/FUD0438/u);
  }, 120000);

  it('builds the same route with the link at the top level, and renders the component', async () => {
    const { html } = await buildRoute(GOOD);
    // The contrast is the point: at the top level the link is the graph, so the tag comes
    // out with its shadow root instead of empty — and no `.fud` reaches the document.
    expect(html).toContain('<template shadowrootmode="open"');
    expect(html).not.toContain('rel="component"');
    expect(html).not.toContain('.fud');
  }, 120000);
});
