/**
 * Two emit contracts the Vite plugin depends on (SDD-19 §4.5/§4.11.1):
 *
 * 1. The page `<head>` is the author's: every element passes through VERBATIM — favicon,
 *    stylesheet, `<script src>`, `<base>` — except `<title>` (interpolated) and
 *    `<link rel="component">` (the component graph, never output).
 * 2. `componentSpecifier` is injected, so a component may live outside the importing
 *    file's directory. Without it the emit keeps the sibling default `./<tag><ext>`.
 */
import { describe, expect, it } from 'vitest';
import { resolveComponents, emitPageModule } from '../../src/emit/index.js';
import { memoryIo } from './_support.js';

const BADGE = `@code {
  const { tone = 'neutral' } = props<{ tone?: string }>();
}

<head>
  <style>.badge { color: red; }</style>
</head>

<app-badge>
  <template shadowrootmode="open"><span class="badge"><slot></slot></span></template>
</app-badge>
`;

const PAGE = `<!DOCTYPE html>
<html>
  <head>
    <link rel="component" href="../components/app-badge.fud">
    <title>@data.title</title>
    <meta charset="utf-8">
    <link rel="icon" href="./logo.svg">
    <link rel="stylesheet" href="https://cdn.example/reset.css">
    <script type="module" src="/fudic-main.js"></script>
  </head>
  <body>
    <app-badge tone="success">ok</app-badge>
  </body>
</html>
`;

const io = memoryIo({
  '/app/routes/index.fud': PAGE,
  '/app/components/app-badge.fud': BADGE,
});
const graph = resolveComponents('/app/routes/index.fud', io);

/** The emitted module quotes the head with JSON escapes; read it back unescaped. */
const unescaped = (code: string): string => code.replace(/\\"/gu, '"');

describe('page <head> passthrough', () => {
  const src = unescaped(emitPageModule(graph));

  it('keeps every element the author wrote', () => {
    expect(src).toContain('<meta charset="utf-8">');
    expect(src).toContain('<link rel="icon" href="./logo.svg">');
    expect(src).toContain('<link rel="stylesheet" href="https://cdn.example/reset.css">');
    expect(src).toContain('<script type="module" src="/fudic-main.js"></script>');
  });

  it('interpolates <title> and drops the component links', () => {
    expect(src).toContain("head += '<title>' + (escapeText(String((data.title) ?? ''))) + '</title>");
    expect(src).not.toContain('rel="component"');
  });
});

describe('asset linking inside <head> (linkAssets)', () => {
  const src = unescaped(
    emitPageModule(graph, { linkAssets: true, assetExists: (spec) => spec === './logo.svg' }),
  );

  it('rewrites a relative, existing URL to the import binding Vite resolves', () => {
    expect(src).toContain('import __fudic_asset_0 from "./logo.svg";');
    expect(src).toContain('<link rel="icon" href="" + __fudic_asset_0 + "">');
  });

  it('leaves an absolute URL and a root-absolute one untouched', () => {
    expect(src).toContain('<link rel="stylesheet" href="https://cdn.example/reset.css">');
    expect(src).toContain('src="/fudic-main.js"');
  });
});

describe('componentSpecifier', () => {
  it('defaults to the sibling file convention', () => {
    expect(emitPageModule(graph)).toContain("from './app-badge.mjs'");
    expect(emitPageModule(graph, { importExt: '.fud' })).toContain("from './app-badge.fud'");
  });

  it('uses the injected specifier, so the component can live anywhere', () => {
    const src = emitPageModule(graph, {
      importExt: '.fud',
      componentSpecifier: (c) => `../components/${c.tag}.fud`,
    });
    expect(src).toContain("from '../components/app-badge.fud'");
    expect(src).not.toContain("from './app-badge.fud'");
  });
});
