/**
 * Byte-for-byte goldens of a ROUTE and its LAYOUT (SDD-88 task 3, criterion 7). SDD-88 takes
 * out the page without a layout and its emit; these lock that a route with a layout emits
 * exactly the same before and after, in one locale and in two.
 *
 * Regenerate deliberately: `pnpm --filter @fudic/compiler exec vitest run
 * test/emit/golden-routes.test.ts -u`.
 */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { compileMessage } from '@fudic/i18n';
import { describe, expect, it } from 'vitest';
import {
  emitLayoutModule,
  emitRouteModule,
  resolveDocument,
  type DocumentGraph,
  type EmitOptions,
  type ResolveIo,
} from '../../src/emit/index.js';
import { localizedIo, type LocaleCompile } from '../../src/index.js';
import { fixtureIo, layoutFixturesDir, memoryIo } from './_support.js';

const goldenDir = join(dirname(fileURLToPath(import.meta.url)), '__golden__', 'routes');
const golden = (file: string): string => join(goldenDir, file);

/** A locale compile with an empty catalog: every text stays in its source language. */
function i18nOf(locale: string, locales: readonly string[]): LocaleCompile {
  return {
    locale,
    locales,
    translate: (message) => (locale === locales[0] ? compileMessage(message.source, locale).value : undefined),
  };
}

function graphOf(entry: string, io: ResolveIo, i18n?: LocaleCompile): DocumentGraph {
  const graph = resolveDocument(entry, i18n === undefined ? io : localizedIo(io, i18n));
  expect(graph.diagnostics).toEqual([]);
  return graph.value;
}

function emitBoth(graph: DocumentGraph, options: EmitOptions = {}): { layout: string; route: string } {
  return { layout: emitLayoutModule(graph, graph.layouts[0]!, options), route: emitRouteModule(graph, options) };
}

/**
 * The blog fixture: a route with its `<head>`, a `.fudapi`, a component, and a layout that
 * writes `lang="es"` and uses `@RenderHead()`, `@RenderBody()` and a section.
 */
const BLOG = join(layoutFixturesDir, 'blog.fud');

/** A tiny route + layout in memory whose `<html>` carries NO `lang`: `localize` adds it with 2+ locales. */
const BARE: Record<string, string> = {
  '/app/src/layouts/_layout.fud': [
    '<!DOCTYPE html>',
    '<html>',
    '  <head><meta charset="utf-8">@RenderHead()</head>',
    '  <body><main>@RenderBody()</main></body>',
    '</html>',
    '',
  ].join('\n'),
  '/app/src/routes/index.fud': [
    '<link rel="layout" href="../layouts/_layout.fud">',
    '<head><title>Inicio</title></head>',
    '<h1>Hola</h1>',
    '',
  ].join('\n'),
};
const BARE_ENTRY = '/app/src/routes/index.fud';

describe('route + layout emit — golden output (byte-for-byte)', () => {
  it('one locale (no i18n): the blog route and its layout', async () => {
    const { layout, route } = emitBoth(graphOf(BLOG, fixtureIo));
    await expect(layout).toMatchFileSnapshot(golden('blog.layout.mjs'));
    await expect(route).toMatchFileSnapshot(golden('blog.route.mjs'));
  });

  it('two locales, compiled in the second: the author\'s lang="es" stays', async () => {
    const i18n = i18nOf('en', ['es', 'en']);
    const { layout, route } = emitBoth(graphOf(BLOG, fixtureIo, i18n), { i18n });
    expect(layout).toContain('"lang", "es"');
    expect(layout).not.toContain('"lang", "en"');
    await expect(layout).toMatchFileSnapshot(golden('blog.en.layout.mjs'));
    await expect(route).toMatchFileSnapshot(golden('blog.en.route.mjs'));
  });

  it('two locales, a layout without lang: it gets the locale of the compilation', async () => {
    const i18n = i18nOf('en', ['es', 'en']);
    const { layout, route } = emitBoth(graphOf(BARE_ENTRY, memoryIo(BARE), i18n), { i18n });
    expect(layout).toContain('"lang", "en"');
    await expect(layout).toMatchFileSnapshot(golden('bare.en.layout.mjs'));
    await expect(route).toMatchFileSnapshot(golden('bare.en.route.mjs'));
  });

  it('one locale declared, a layout without lang: the <html> stays as the author wrote it', async () => {
    const i18n = i18nOf('es', ['es']);
    const { layout, route } = emitBoth(graphOf(BARE_ENTRY, memoryIo(BARE), i18n), { i18n });
    expect(layout).not.toContain('"lang"');
    await expect(layout).toMatchFileSnapshot(golden('bare.es.layout.mjs'));
    await expect(route).toMatchFileSnapshot(golden('bare.es.route.mjs'));
  });
});
