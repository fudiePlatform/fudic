import { describe, expect, it } from 'vitest';
import { collectStyles, emitCssVirtuals } from '../src/css.js';
import { parseFud } from './_support.js';

const withStyle = (css: string): string =>
  `<head>\n  <style>\n${css}\n  </style>\n</head>\n\n` +
  `<app-host>\n  <template shadowrootmode="open"><i></i></template>\n</app-host>\n`;

describe('emitCssVirtuals', () => {
  it('copies the body verbatim and keeps offsets identical to the source', () => {
    const source = withStyle('    :host { color: red; }');
    const [css] = emitCssVirtuals(source, 'app-host.fud', parseFud(source));

    expect(css!.languageId).toBe('css');
    expect(css!.fileName).toBe('app-host.fud.0.css');
    expect(css!.text).toContain(':host { color: red; }');
    // Identity mapping: what the CSS service sees at an offset is what the .fud has there.
    for (const m of css!.mappings) {
      expect(m.generatedOffset).toBe(m.sourceOffset);
    }
  });

  it('replaces a Razor region with a filler of exactly the same length', () => {
    const source = withStyle('    @media (min-width: @bp.tablet) { :host { color: red; } }');
    const [css] = emitCssVirtuals(source, 'app-host.fud', parseFud(source));

    expect(css!.text).toContain('(min-width: zzzzzzzzzz)');
    // Same offsets as the source: the placeholder is as long as `@bp.tablet`, and the
    // markup above the body is blanked out rather than dropped.
    expect(css!.text.indexOf('zzzzzzzzzz')).toBe(source.indexOf('@bp.tablet'));
    expect(css!.text.length).toBe(source.indexOf('</style>'));
  });

  it('blanks out the markup above the body, keeping the line count', () => {
    const source = withStyle('    :host { color: red; }');
    const [css] = emitCssVirtuals(source, 'app-host.fud', parseFud(source));
    const upto = (text: string, needle: string): number =>
      text.slice(0, text.indexOf(needle)).split('\n').length;

    expect(css!.text.trimStart().startsWith(':host')).toBe(true);
    expect(upto(css!.text, ':host')).toBe(upto(source, ':host'));
  });

  it('emits one virtual per <style>, numbered in source order', () => {
    const source =
      '<head>\n  <style>a { color: red; }</style>\n  <style>b { color: blue; }</style>\n</head>\n\n' +
      '<app-host>\n  <template shadowrootmode="open"><i></i></template>\n</app-host>\n';
    const files = emitCssVirtuals(source, 'app-host.fud', parseFud(source));

    expect(files.map((f) => f.fileName)).toEqual(['app-host.fud.0.css', 'app-host.fud.1.css']);
    expect(files[1]!.text).toContain('color: blue');
  });

  it('emits nothing when the file has no <style>', () => {
    const source = '<app-host>\n  <template shadowrootmode="open"><i></i></template>\n</app-host>\n';

    expect(emitCssVirtuals(source, 'app-host.fud', parseFud(source))).toEqual([]);
  });
});

describe('collectStyles', () => {
  it('finds a <style> in a page head', () => {
    const page =
      '<!DOCTYPE html>\n<html>\n  <head>\n    <style>p { color: red; }</style>\n  </head>\n  <body><p>x</p></body>\n</html>\n';

    expect(collectStyles(parseFud(page))).toHaveLength(1);
  });

  it('finds a <style> in a route head and inside its markup', () => {
    const route =
      '<link rel="layout" href="./_layout.fud">\n<head>\n  <style>a { color: red; }</style>\n</head>\n' +
      '<section>\n  <style>b { color: blue; }</style>\n</section>\n' +
      '@section nav {\n  <style>c { color: green; }</style>\n}\n';

    expect(collectStyles(parseFud(route))).toHaveLength(3);
  });

  it('finds a <style> in a route that declares no head', () => {
    const route = '<link rel="layout" href="./_layout.fud">\n<section>\n  <style>a { color: red; }</style>\n</section>\n';

    expect(collectStyles(parseFud(route))).toHaveLength(1);
  });

  it('finds a <style> nested inside the shadow template', () => {
    const source =
      '<app-host>\n  <template shadowrootmode="open">\n    <style>i { color: red; }</style>\n  </template>\n</app-host>\n';

    expect(collectStyles(parseFud(source))).toHaveLength(1);
  });
});
