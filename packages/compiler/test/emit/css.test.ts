/**
 * BUG-08: the component CSS never goes through minification, in any output. The emit
 * takes the `<style>` body as a raw `source.slice(...)` and hands it to `cssTemplate`,
 * so from `export const css = \`…\`` onwards it is the content of a template literal and
 * no later tool touches it — a JS minifier does not enter a template literal, by
 * definition of the language (§1, §2.1).
 *
 * This file owns the acceptance criteria of BUG-08. It asserts on the CSS a module
 * actually SHIPS, not on the AST: what reaches the browser is the text inside that
 * literal.
 *
 * It pulls in happy-dom because §6.5 is an equivalence criterion, and the only honest way
 * to state "compacting did not change the sheet" is to let an INDEPENDENT CSS parser read
 * both and compare what it built. As a LIBRARY, not as the test environment: the compiler
 * runs on Node and its `lib` carries no DOM on purpose — a compiler that can reach for
 * `document` is a compiler that eventually does.
 */
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { Window } from 'happy-dom';
import {
  resolveComponents,
  emitComponentModule,
  type ComponentGraph,
} from '../../src/emit/index.js';
import type { ElementNode } from '../../src/html/index.js';
import type { StyleNode } from '../../src/css/index.js';
import { fixture, fixturesDir, fixtureIo, memoryIo } from './_support.js';

const graph: ComponentGraph = resolveComponents(join(fixturesDir, 'home.fud'), fixtureIo);

/**
 * The CSS a module SHIPS: the body of its `export const css` template literal, with the
 * template escapes undone. Everything here is asserted on this string and not on the
 * emitted source, because this is the text the browser ends up parsing.
 */
function emittedCss(moduleSource: string): string {
  const match = /export const css = `([\s\S]*?)`;\n/u.exec(moduleSource);
  expect(match, 'the module exports a css template').not.toBeNull();
  return match![1]!.replace(/\\([`$\\])/gu, '$1');
}

/** The `<style>` body of a fixture, read from the file — an oracle the emit never touches. */
function sourceCss(fileName: string): string {
  const match = /<style>([\s\S]*?)<\/style>/u.exec(fixture(fileName));
  expect(match, `${fileName} has a <style>`).not.toBeNull();
  return match![1]!;
}

const cssOfComponent = (tag: string): string =>
  emittedCss(emitComponentModule(graph, graph.components.get(tag)!));

/**
 * What an independent CSS parser BUILT from a sheet, as text.
 *
 * Whitespace is normalised on both sides before comparing — it is the very thing under
 * test, so leaving it in would only ever compare the two inputs to each other. What
 * survives normalisation is what matters: the selectors, the declarations, the at-rule
 * preludes and their order. A collapse that welded two tokens together, dropped a
 * declaration or turned `a :hover` into `a:hover` shows up here as a different dump.
 *
 * happy-dom's parser does not model CSS nesting: it keeps `.card` and drops what is
 * nested inside it. That is a limitation of the ORACLE, and it hits both sides equally,
 * so this comparison cannot speak about nested blocks. The nested rule of `app-card` is
 * asserted directly, below, for exactly that reason.
 */
function dumpSheet(css: string): string {
  const sheet = new (new Window().CSSStyleSheet)();
  sheet.replaceSync(css);
  return [...sheet.cssRules]
    .map((rule) => rule.cssText)
    .join('\n')
    .replace(/\s+/gu, ' ')
    .replace(/\s*([{};:])\s*/gu, '$1');
}

describe('BUG-08 §6.1 — the CSS is emitted compacted', () => {
  const css = cssOfComponent('app-badge');

  // These two were asserted the other way around first, and seen green, so that inverting
  // them is a result and not a description of whatever the compactor happened to do.
  it('ships no newline of the source', () => {
    expect(css).not.toMatch(/\n/u);
  });

  it('ships no run of more than one space', () => {
    expect(css).not.toMatch(/ {2}/u);
  });

  it('drops the whitespace around the punctuation that never needs it', () => {
    expect(css).toContain(':host{display:inline-block;}');
  });
});

describe('BUG-08 §6.2 — an interpolation in the middle of a declaration', () => {
  /**
   * The one case that can break user CSS, and the reason task 2 comes before task 4: the
   * text around a `@(…)` is NOT continuous with it. The two runs of spaces inside the
   * second expression are deliberate — nothing but a verbatim copy keeps them.
   */
  const io = memoryIo({
    '/home.fud':
      '<!DOCTYPE html>\n<html><head><link rel="component" href="./m.fud"></head><body></body></html>',
    '/m.fud':
      '@code {\n  const { size = 1 } = props<{ size?: number }>();\n}\n\n' +
      '<head>\n  <style>\n    .badge { padding: @(size)rem @(size  *  2)rem; }\n  </style>\n</head>\n\n' +
      '<m-el>\n  <template shadowrootmode="open"><span class="badge"></span></template>\n</m-el>\n',
  });
  const g = resolveComponents('/home.fud', io);
  const css = emittedCss(emitComponentModule(g, g.components.get('m-el')!));

  it('emits each expression byte for byte, inner spacing included', () => {
    expect(css).toContain('@(size)');
    expect(css).toContain('@(size  *  2)');
  });

  it('keeps the space that separated the two values', () => {
    expect(css).toContain('@(size)rem @(size  *  2)rem');
  });
});

describe('BUG-08 §6.5 — the emitted CSS is equivalent to the source CSS', () => {
  for (const [tag, file] of [
    ['app-badge', 'app-badge.fud'],
    ['app-button', 'app-button.fud'],
    ['app-card', 'app-card.fud'],
  ] as const) {
    it(`${tag}: an independent parser builds the same sheet`, () => {
      expect(dumpSheet(cssOfComponent(tag))).toBe(dumpSheet(sourceCss(file)));
    });
  }

  it('keeps the nested rule of app-card, which the oracle cannot see', () => {
    expect(cssOfComponent('app-card')).toMatch(/\.body\s*\{\s*margin-top:\s*0\.5rem;?\s*\}/u);
  });
});

describe('BUG-08 §6.3 — the CSS comments survive', () => {
  const io = memoryIo({
    '/home.fud':
      '<!DOCTYPE html>\n<html><head><link rel="component" href="./m.fud"></head><body></body></html>',
    '/m.fud':
      '<head>\n  <style>\n    /*! (c) keep   me */\n    .a { color: red; }\n  </style>\n</head>\n\n' +
      '<m-el>\n  <template shadowrootmode="open"><span></span></template>\n</m-el>\n',
  });
  const g = resolveComponents('/home.fud', io);
  const css = emittedCss(emitComponentModule(g, g.components.get('m-el')!));

  it('keeps a banner comment, with the whitespace inside it', () => {
    // Dropping comments is a SECOND decision (§4.3): it changes what the author wrote and
    // it takes the licence with it. Compacting whitespace is one the browser already makes.
    expect(css).toContain('/*! (c) keep   me */');
  });

  it('compacts around it all the same', () => {
    expect(css).toContain('.a{color:red;}');
  });
});

describe('BUG-08 §6.4 — the asset linking still reaches into the compacted CSS', () => {
  const io = memoryIo({
    '/home.fud':
      '<!DOCTYPE html>\n<html><head><link rel="component" href="./m.fud"></head><body></body></html>',
    '/m.fud':
      '<head>\n  <style>\n    .a {\n      background: url(./bg.png);\n    }\n  </style>\n</head>\n\n' +
      '<m-el>\n  <template shadowrootmode="open"><span></span></template>\n</m-el>\n',
  });
  const g = resolveComponents('/home.fud', io);
  const src = emitComponentModule(g, g.components.get('m-el')!, { linkAssets: true });

  // The order in `buildComponentModule` is load-bearing: the css is built BEFORE the
  // import lines are written, because building it is what registers the import.
  it('turns the url into an import and interpolates the binding', () => {
    expect(src).toContain('import __fudic_asset_0 from "./bg.png";');
    expect(src).toContain('url(${__fudic_asset_0})');
  });

  it('and the CSS around it came out compacted', () => {
    expect(src).toContain('export const css = `.a{background:url(${__fudic_asset_0});}`;');
  });
});

describe('BUG-08 §6.6 — the source maps do not degrade', () => {
  /**
   * There is no emit anchor for a CSS interpolation: `export const css` is one line, and
   * what resolves a position inside it back to the `.fud` is the `RazorExpression`'s own
   * span in the AST. That is exactly why §4.1 emits those parts VERBATIM — compacting
   * them, or emitting anything but their source bytes, would leave every span in the
   * `<style>` pointing at text that is no longer there.
   */
  const io = memoryIo({
    '/home.fud':
      '<!DOCTYPE html>\n<html><head><link rel="component" href="./m.fud"></head><body></body></html>',
    '/m.fud':
      '@code {\n  const { size = 1 } = props<{ size?: number }>();\n}\n\n' +
      '<head>\n  <style>\n    .badge { padding: @(size)rem; }\n  </style>\n</head>\n\n' +
      '<m-el>\n  <template shadowrootmode="open"><span class="badge"></span></template>\n</m-el>\n',
  });
  const g = resolveComponents('/home.fud', io);
  const comp = g.components.get('m-el')!;
  const style = comp.doc.head!.children.find(
    (c): c is ElementNode => c.type === 'element' && c.name === 'style',
  )!.children[0]!;
  const css = emittedCss(emitComponentModule(g, comp));

  it('every interpolation of the <style> still resolves to its offset in the .fud', () => {
    const exprs = (style as StyleNode).parts.filter((p) => p.type === 'razor-expression');
    expect(exprs.length).toBe(1);
    for (const expr of exprs) {
      const atSpan = comp.source.slice(expr.span.start, expr.span.end);
      expect(atSpan).toBe('@(size)'); // the span still covers the expression in the source
      expect(css).toContain(atSpan); // and those same bytes are what the module ships
    }
  });
});
