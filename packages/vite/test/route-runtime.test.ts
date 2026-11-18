/**
 * SDD-88 (FUD1583): the runtime marker belongs to the layout that owns the document. A route
 * that writes it in its `<head>` used to build with the marker left raw — no runtime tags, no
 * preloads, no coordinator. Now the build says so and stops; the same marker in the layout builds.
 */

import { afterAll, describe, expect, it } from 'vitest';
import { build, type Logger } from 'vite';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fudic } from '../src/index.js';
import { runtimeAlias } from './helpers/alias.js';

const MARKER = '<script type="module" src="fudic:runtime"></script>';

const layout = (head: string): string =>
  `<!DOCTYPE html>\n<html lang="es">\n<head>${head}@RenderHead()</head>\n<body>@RenderBody()</body>\n</html>\n`;

const route = (head: string): string =>
  `<link rel="layout" href="../layouts/_layout.fud">\n<head>${head}<title>Inicio</title></head>\n<h1>Inicio</h1>\n`;

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function project(files: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(join(tmpdir(), 'fudic-route-runtime-'));
  roots.push(root);
  for (const [path, contents] of Object.entries({ 'fudic.json': '{"id":"app"}', ...files })) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), contents);
  }
  return root;
}

/** What the build said when it failed (its error and every error it logged), or undefined. */
async function buildOf(root: string): Promise<string | undefined> {
  const errors: string[] = [];
  const noop = (): void => {};
  const logger: Logger = {
    info: noop,
    warn: noop,
    warnOnce: noop,
    error: (message: string) => errors.push(message),
    clearScreen: noop,
    hasErrorLogged: () => false,
    hasWarned: false,
  };
  try {
    await build({
      root,
      logLevel: 'error',
      customLogger: logger,
      resolve: { alias: { ...runtimeAlias } },
      plugins: [fudic({ liveCheck: false })],
      build: { write: false, minify: false },
    });
    return undefined;
  } catch (error) {
    return [error instanceof Error ? error.message : String(error), ...errors].join('\n');
  }
}

describe('the runtime marker in a route', () => {
  it('in the route’s <head>: the build fails with FUD1583', async () => {
    const said = await buildOf(project({ 'src/layouts/_layout.fud': layout(''), 'src/routes/index.fud': route(MARKER) }));
    expect(said).toContain('FUD1583');
  }, 300000);

  it('in the layout’s <head>: the build passes', async () => {
    const said = await buildOf(project({ 'src/layouts/_layout.fud': layout(MARKER), 'src/routes/index.fud': route('') }));
    expect(said).toBeUndefined();
  }, 300000);
});
