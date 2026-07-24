/**
 * Module emit (SDD-15 server branch) — the real deliverable: one `.mjs` per component
 * and one for the page, produced from the AST + the resolved dependency graph. The
 * compiler emits TEXT and imports no runtime; these tests assert the generated source
 * structurally AND, where possible, EXECUTE it (a leaf component and the whole page) to
 * prove the codegen actually runs.
 *
 * Not covered here (browser-only): the style polyfill's runtime behaviour — it uses
 * MutationObserver / CSSStyleSheet / shadowRoot, so we only assert it is EMITTED. Its
 * effect (adopting sheets so styles apply) still requires opening the page in a browser.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  resolveComponents,
  emitComponentModule,
  emitPageModule,
  type ComponentGraph,
} from '../../src/emit/index.js';
import { fixturesDir, fixtureIo, memoryIo, recordingDom, evalLeafModule, minimalSsr } from './_support.js';

const graph: ComponentGraph = resolveComponents(join(fixturesDir, 'home.fud'), fixtureIo);
const module = (tag: string): string => emitComponentModule(graph, graph.components.get(tag)!);

describe('emitComponentModule — a leaf component (app-badge)', () => {
  const src = module('app-badge');

  it('exports tag, css and render', () => {
    expect(src).toContain('export const tag = "app-badge";');
    expect(src).toContain('export const css = `');
    expect(src).toContain('export function render($dom, $shadow, props) {');
  });

  it('has no ES imports (a leaf depends on nothing)', () => {
    expect(src).not.toContain('import ');
  });

  it('runs against a recording Dom and builds the expected calls', () => {
    const { render } = evalLeafModule(src);
    const { dom, calls } = recordingDom();
    render(dom, { $node: 'shadow' }, { tone: 'success' });

    const ops = calls.map((c) => c.op);
    expect(ops).toContain('element');
    expect(ops).toContain('append');

    const classCall = calls.find((c) => c.op === 'setAttr' && c.args[1] === 'class');
    expect(classCall).toBeDefined();
    expect(classCall!.args[2]).toBe('badge success'); // base + conditional resolved at runtime
  });

  it("defaults props<T>() when omitted (tone → 'neutral')", () => {
    const { render } = evalLeafModule(src);
    const { dom, calls } = recordingDom();
    render(dom, { $node: 'shadow' }, {}); // no props
    const classCall = calls.find((c) => c.op === 'setAttr' && c.args[1] === 'class');
    expect(classCall!.args[2]).toBe('badge'); // neither success nor warning
  });
});

describe('emitComponentModule — composition & control flow (app-card)', () => {
  const src = module('app-card');

  it('imports only the child components it uses', () => {
    expect(src).toContain("import { render as renderAppButton } from './app-button.mjs';");
    expect(src).not.toContain('renderAppBadge'); // app-card never renders a badge
  });

  it('emits an inert signal (SSR contributes only the initial value)', () => {
    expect(src).toContain('const expanded = { value: (false) };');
  });

  it('renders a nested component host with data-adopt + attachShadow + its render call', () => {
    expect(src).toContain('$dom.setAttr($n16, \'data-adopt\', "app-button");');
    expect(src).toContain('$dom.attachShadow($n16)');
    expect(src).toContain('renderAppButton($dom, $n17, { "variant": "ghost" });');
  });

  it('lowers @if/@else to real JS control flow', () => {
    expect(src).toContain('if (expanded.value) {');
    expect(src).toContain('} else {');
  });

  it('lowers content interpolation to $dom.text(String((expr) ?? ""))', () => {
    expect(src).toContain("$dom.text(String((title) ?? ''))");
  });
});

describe('emitComponentModule — attrExpr shapes', () => {
  // A crafted component exercising a MIXED (static + interpolation) attribute, which the
  // fixtures do not have. Resolved via an in-memory page that links it.
  const io = memoryIo({
    '/home.fud':
      '<!DOCTYPE html>\n<html><head><link rel="component" href="./m.fud"></head><body></body></html>',
    '/m.fud':
      '@code {\n  const helper = 1;\n}\n' + // a non-props declaration: exercised, ignored
      '<m-el>\n  <template shadowrootmode="open">' +
      '<div id="z" title="x-@y"></div><!-- a comment is dropped -->' +
      '</template>\n</m-el>\n',
  });
  const g = resolveComponents('/home.fud', io);
  const src = emitComponentModule(g, g.components.get('m-el')!);

  it('emits a template literal for a mixed attribute and omits it when falsy', () => {
    expect(src).toContain('`x-${y}`');
    expect(src).toContain('if ($a === true)');
    expect(src).toContain("$a !== false && $a != null");
  });

  it('emits a static non-class attribute as a setAttr with a JSON value', () => {
    expect(src).toContain('$dom.setAttr($n0, "id", "z");');
  });

  it('ignores comments and a non-props const in @code (no crash, not emitted)', () => {
    expect(src).not.toContain('a comment is dropped');
    expect(src).not.toContain('helper'); // the non-props const is not carried into render
  });

  it('emits a static attribute value as a JSON string (via the page fixtures)', () => {
    // app-button variant="ghost" is passed as a static prop by app-card.
    expect(module('app-card')).toContain('{ "variant": "ghost" }');
  });
});

describe('emitPageModule — home.mjs', () => {
  const src = emitPageModule(graph);

  it('imports render/tag/css of every component', () => {
    for (const tag of ['AppCard', 'AppButton', 'AppBadge']) {
      expect(src).toContain(`import { render as render${tag}, tag as render${tag}Tag, css as render${tag}Css } from`);
    }
  });

  it('builds a COMPONENTS array and a page(data, io) that destructures io', () => {
    expect(src).toContain('const COMPONENTS = [');
    expect(src).toContain('export function page(data, io) {');
    expect(src).toContain('const { createDom, serialize, escapeText } = io;');
  });

  it('interpolates the title via escapeText and passes <meta> through', () => {
    expect(src).toContain("escapeText(String((data.title) ?? ''))");
    expect(src).toContain('<meta charset=\\"utf-8\\">');
  });

  it('emits the style polyfill and places its <script> BEFORE the style modules', () => {
    expect(src).toContain('const STYLE_POLYFILL = `');
    expect(src).toContain('new MutationObserver');
    const scriptAt = src.indexOf("'  <script>' + STYLE_POLYFILL");
    const stylesAt = src.indexOf('<style type="module" specifier=');
    expect(scriptAt).toBeGreaterThan(-1);
    expect(stylesAt).toBeGreaterThan(scriptAt); // head order: polyfill first, then sheets
  });

  it('lowers @foreach to a real for-loop and marks component hosts with data-adopt', () => {
    expect(src).toContain('for (const item of data.items) {');
    expect(src).toContain('$dom.setAttr($n12, \'data-adopt\', "app-card");');
  });
});

describe('emitPageModule — executed end to end', () => {
  let html = '';

  beforeAll(async () => {
    // Emit every module to a temp dir and import the page, exactly like build.ts does,
    // then run page() with a minimal DOM/serializer to get real HTML out.
    const dir = mkdtempSync(join(tmpdir(), 'fudic-emit-'));
    mkdirSync(dir, { recursive: true });
    for (const comp of graph.components.values()) {
      writeFileSync(join(dir, `${comp.tag}.mjs`), emitComponentModule(graph, comp), 'utf8');
    }
    writeFileSync(join(dir, 'home.mjs'), emitPageModule(graph), 'utf8');
    const mod = (await import(pathToFileURL(join(dir, 'home.mjs')).href)) as {
      page: (data: unknown, io: unknown) => string;
    };
    const data = {
      title: 'Inicio',
      items: [{ id: '1', title: 'Primero', description: 'Desc', featured: true }],
    };
    html = mod.page(data, minimalSsr());
  });

  it('produces a full HTML document with the interpolated title', () => {
    expect(html.startsWith('<!DOCTYPE html>\n<html lang="es">')).toBe(true);
    expect(html).toContain('<title>Inicio</title>');
  });

  it('emits the blocking style polyfill and the per-component style modules in <head>', () => {
    expect(html).toContain('<script>(function () {');
    expect(html).toContain('new MutationObserver');
    expect(html).toContain('<style type="module" specifier="app-card">');
    expect(html).toContain('<style type="module" specifier="app-badge">');
  });

  it('renders component hosts as DSD with data-adopt and projected light DOM', () => {
    expect(html).toContain('<app-card data-adopt="app-card"><template shadowrootmode="open">');
    expect(html).toContain('<app-badge data-adopt="app-badge">');
    expect(html).toContain('Destacado'); // badge light DOM projected through <slot>
  });

  it('takes the @if branch driven by the injected data (featured item shows a badge)', () => {
    // items has one featured entry → the grid branch, not the empty branch.
    expect(html).not.toContain('No hay elementos todavía.');
    expect(html).toContain('<section class="grid">');
  });
});

describe('emitComponentModule — head edge cases', () => {
  // A component whose <head> style has no closing </style> (the head trails the component
  // so the raw-text run ends at EOF, not by eating the template): the CSS slice must fall
  // back to the element's span end instead of a missing close span.
  it('slices the CSS to the element end when the <style> has no close tag', () => {
    const io = memoryIo({
      '/home.fud':
        '<!DOCTYPE html>\n<html><head><link rel="component" href="./m.fud"></head><body></body></html>',
      '/m.fud':
        '<m-el>\n  <template shadowrootmode="open"><span></span></template>\n</m-el>\n<head><style>.x{color:red}',
    });
    const g = resolveComponents('/home.fud', io);
    const src = emitComponentModule(g, g.components.get('m-el')!);
    expect(src).toContain('export const css = `.x{color:red}`;');
  });
});

describe('emitPageModule — <title> child shapes', () => {
  const pageWithTitle = (title: string): string => {
    const io = memoryIo({
      '/home.fud': `<!DOCTYPE html>\n<html><head>${title}</head><body></body></html>`,
    });
    return emitPageModule(resolveComponents('/home.fud', io));
  };

  it('emits a plain-text title as a JSON string literal', () => {
    expect(pageWithTitle('<title>Static</title>')).toContain('head += \'<title>\' + ("Static") + \'</title>\\n\';');
  });

  it('emits an empty title as the empty-string fallback', () => {
    expect(pageWithTitle('<title></title>')).toContain('head += \'<title>\' + (\'\') + \'</title>\\n\';');
  });

  it('emits the empty-string fallback for a non-text, non-expression child (razor comment)', () => {
    expect(pageWithTitle('<title>@* c *@</title>')).toContain('head += \'<title>\' + (\'\') + \'</title>\\n\';');
  });
});
