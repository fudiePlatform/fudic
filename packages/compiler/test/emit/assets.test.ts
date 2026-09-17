/**
 * The asset linker (SDD-19 §4.5). Under `linkAssets`, static relative asset URLs on
 * elements (`src`/`poster`/`<link href>`) and inside CSS `url(…)` become ES imports
 * Vite resolves and hashes; absolute/scheme/data/`<a href>`/dynamic refs are left as
 * literals. Off by default the emit is byte-identical (proven by the golden tests).
 */
import { describe, expect, it } from 'vitest';
import { resolveComponents, emitComponentModule, AssetLinker } from '../../src/emit/index.js';
import { memoryIo } from './_support.js';

describe('AssetLinker.linkable', () => {
  it('asks the host about the two ways of naming a file of your own', () => {
    // Relative: the framework chooses the URL — hashed, published.
    expect(AssetLinker.linkable('./logo.png')).toBe(true);
    expect(AssetLinker.linkable('../a/b.svg')).toBe(true);
    expect(AssetLinker.linkable('logo.png')).toBe(true);
    // Root-absolute: the AUTHOR chose the URL, and the file is the project's public one.
    // It used to be waved through as "already final", and that is why a typo there was a
    // 404 nobody reported and the Service Worker never heard of the file. Asking about it
    // changes nothing it produces — the URL comes back as written, plus `base`.
    expect(AssetLinker.linkable('/logo.svg')).toBe(true);
    // Including a `.js`, which is code and never published, but IS served as it is: that
    // is what being public means.
    expect(AssetLinker.linkable('/probe.js')).toBe(true);
  });

  it('rejects what is already a final URL, and none of it ours', () => {
    expect(AssetLinker.linkable('https://cdn/x.png')).toBe(false);
    expect(AssetLinker.linkable('data:image/png;base64,AAAA')).toBe(false);
    expect(AssetLinker.linkable('//cdn/x.png')).toBe(false);
    expect(AssetLinker.linkable('#frag')).toBe(false);
    expect(AssetLinker.linkable('')).toBe(false);
  });

  it('never links CODE: a module is compiled, an asset is fetched as it is', () => {
    // Publishing one as an asset copies the SOURCE into the output and hands the page a URL
    // to it, which is how a misplaced `<link rel="component">` shipped a component's source
    // inside every document.
    expect(AssetLinker.linkable('./s-hero.fud')).toBe(false);
    expect(AssetLinker.linkable('./analytics.js')).toBe(false);
    expect(AssetLinker.linkable('../lib/index.mjs')).toBe(false);
    expect(AssetLinker.linkable('./app.ts')).toBe(false);
    expect(AssetLinker.linkable('./view.tsx')).toBe(false);
    // The query is an instruction to the bundler, not part of the name.
    expect(AssetLinker.linkable('./s-hero.fud?raw')).toBe(false);
    // And the extension is read from the FILE, never from a directory that happens to
    // carry a dot: `./v1.2/logo.png` is an image, and `./assets.js/logo` is not a `.js`.
    expect(AssetLinker.linkable('./v1.2/logo.png')).toBe(true);
    expect(AssetLinker.linkable('./assets.js/logo')).toBe(true);
    expect(AssetLinker.linkable('./theme.css')).toBe(true);
    expect(AssetLinker.linkable('./logo.SVG')).toBe(true);
    expect(AssetLinker.linkable('./bundle.JS')).toBe(false);
  });
});

const componentSrc = (linkAssets: boolean): string => {
  const io = memoryIo({
    '/home.fud':
      '<!DOCTYPE html>\n<html><head><link rel="component" href="./m.fud"></head><body></body></html>',
    '/m.fud':
      '<m-el>\n  <template shadowrootmode="open">' +
      '<img src="./logo.png">' +
      '<img src="https://cdn/x.png">' +
      '<link rel="stylesheet" href="./s.css">' +
      '<a href="./other.html">x</a>' +
      '</template>\n</m-el>\n' +
      '<head><style>.x{ background: url(./bg.png) } .y{ list-style: url("http://y/z.png") }</style>',
  });
  const g = resolveComponents('/home.fud', io);
  return emitComponentModule(g, g.components.get('m-el')!, { linkAssets });
};

describe('emitComponentModule — linkAssets on', () => {
  const src = componentSrc(true);

  it('rewrites a static relative src to an imported binding', () => {
    expect(src).toContain('import __fudic_asset_0 from "./logo.png";');
    expect(src).toContain('$dom.setAttr($n0, "src", __fudic_asset_0);');
  });

  it('leaves an absolute src as a literal string', () => {
    expect(src).toContain('$dom.setAttr($n1, "src", "https://cdn/x.png");');
  });

  it('links a <link href> but never an <a href>', () => {
    expect(src).toContain('import __fudic_asset_1 from "./s.css";');
    expect(src).toContain('"href", "./other.html"'); // <a href> stays a literal, not imported
  });

  it('rewrites a relative CSS url(…) to an interpolated import, leaving absolute ones', () => {
    expect(src).toContain('import __fudic_asset_2 from "./bg.png";');
    expect(src).toContain('url(${__fudic_asset_2})');
    expect(src).toContain('url("http://y/z.png")'); // absolute CSS url untouched
  });
});

describe('emitComponentModule — linkAssets off (default)', () => {
  const src = componentSrc(false);

  it('keeps every asset URL as an inline literal (no imports)', () => {
    expect(src).not.toContain('__fudic_asset_');
    expect(src).toContain('$dom.setAttr($n0, "src", "./logo.png");');
    expect(src).toContain('url(./bg.png)');
  });
});

/**
 * BUG-40 §3.1: with a resolver, the emit writes the published URL and registers NO import.
 *
 * An import asks the bundler what a file MEANS, and the answer depends on the extension —
 * a `.css` is a stylesheet with no default export, and the build dies — and on which of the
 * three passes is asking, because a bundler's asset hash is a property of the bundle. The
 * host knows the one answer, so it is asked for it.
 */
describe('emitComponentModule — the host names the asset', () => {
  const asked: string[] = [];
  const src = (() => {
    const io = memoryIo({
      '/home.fud':
        '<!DOCTYPE html>\n<html><head><link rel="component" href="./m.fud"></head><body></body></html>',
      '/m.fud':
        '<m-el>\n  <template shadowrootmode="open">' +
        '<img src="./logo.png">' +
        '<img src="https://cdn/x.png">' +
        '<link rel="stylesheet" href="./theme.css">' +
        '</template>\n</m-el>\n' +
        '<head><style>.x{ background: url(./bg.png) }</style>',
    });
    const g = resolveComponents('/home.fud', io);
    return emitComponentModule(g, g.components.get('m-el')!, {
      linkAssets: true,
      assetUrl: (spec) => {
        asked.push(spec);
        return `/assets/${spec.replace(/^\.\//u, '').replace('.', '-Hs8')}`;
      },
    });
  })();

  it('writes the URL as a literal and imports nothing at all', () => {
    expect(src).not.toContain('__fudic_asset_');
    expect(src).not.toContain('import ');
    expect(src).toContain('$dom.setAttr($n0, "src", "/assets/logo-Hs8png");');
  });

  it('names a stylesheet too — the import that used to kill the build', () => {
    expect(src).toContain('"/assets/theme-Hs8css"');
  });

  it('reaches inside the CSS as well, so one file cannot get two names', () => {
    expect(src).toContain('url(${"/assets/bg-Hs8png"})');
  });

  it('is never asked about a URL that is already final', () => {
    expect(asked).not.toContain('https://cdn/x.png');
  });
});

describe('AssetLinker.filePath', () => {
  it('is the file a specifier names, without the instruction to the bundler', () => {
    // `theme.css?url` is a real file asked for in a particular way. Answering "not found"
    // to it reports a missing asset that is sitting right there.
    expect(AssetLinker.filePath('./theme.css?url')).toBe('./theme.css');
    expect(AssetLinker.filePath('./logo.png')).toBe('./logo.png');
  });

  it('is what the existence check is asked about, and what FUD0363 names', () => {
    const linker = new AssetLinker(true, (file) => file === './there.css');
    expect(linker.maybeRef('./there.css?url')).toBe('__fudic_asset_0');
    expect(linker.maybeRef('./gone.css?url')).toBeNull();
    expect(linker.missing()).toEqual(['./gone.css']);
  });

  it('registers one import per specifier, however many times it is referenced', () => {
    const linker = new AssetLinker(true);
    expect(linker.maybeRef('./logo.png')).toBe('__fudic_asset_0');
    expect(linker.maybeRef('./logo.png')).toBe('__fudic_asset_0');
    expect(linker.imports()).toEqual(['import __fudic_asset_0 from "./logo.png";']);
  });
});
