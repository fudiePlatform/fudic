/**
 * SDD-49 criteria 4–9: the `@import`s of a document sheet, flattened (`parseImport`,
 * `flattenImports`, `originOf`).
 *
 * The host's reader is a map of specifier → text: the compiler has no filesystem, and every
 * specifier it asks for is relative to the `.fud` — so the map's keys are exactly what the
 * flattener must have resolved.
 */

import { describe, expect, it } from 'vitest';
import {
  FUD_IMPORT_CYCLE,
  FUD_IMPORT_EXTERNAL,
  FUD_IMPORT_MISPLACED,
  FUD_IMPORT_MISSING,
  FUD_IMPORT_REORDERED,
  flattenImports,
  joinSpec,
  originOf,
  parseImport,
  plainSheet,
  type CssRead,
  type FlatSheet,
} from '../../src/css/flatten.js';

/** An in-memory host: what it was asked for, and the text of what exists. */
function host(files: Record<string, string>): { read: CssRead; asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    read: (spec) => {
      asked.push(spec);
      return files[spec] ?? null;
    },
  };
}

function flat(root: string, files: Record<string, string>, spec = './main.css'): FlatSheet {
  let sheet!: FlatSheet;
  expect(() => {
    sheet = flattenImports(spec, root, host(files).read);
  }).not.toThrow();
  return sheet;
}

/** Each diagnostic as `[file, code, severity, the text of its own file it covers]`. */
function diags(sheet: FlatSheet, texts: Record<string, string>): readonly (readonly string[])[] {
  return sheet.diagnostics.map(({ file, diagnostic: d }) => [
    file,
    d.code,
    d.severity,
    texts[file]!.slice(d.span.start, d.span.end),
  ]);
}

describe('parseImport (criterion 4)', () => {
  it.each([
    ['"a.css"', 'a.css'],
    ["'a.css'", 'a.css'],
    ['url(a.css)', 'a.css'],
    ['URL(a.css)', 'a.css'],
    ['url("a.css")', 'a.css'],
    ["url( 'a.css' )", 'a.css'],
    ['url(  a.css  )', 'a.css'],
    ['  "a.css"  ', 'a.css'],
  ])('reads the URL of %s', (prelude, url) => {
    const imp = parseImport(prelude)!;
    expect(imp).toEqual({ url, urlSpan: imp.urlSpan });
    expect(prelude.slice(imp.urlSpan.start, imp.urlSpan.end)).toBe(url);
  });

  it('keeps a URL whose quotes do not wrap all of it as written', () => {
    expect(parseImport('url("a"b)')?.url).toBe('"a"b');
  });

  it('reads `layer` and `layer(x)`', () => {
    expect(parseImport('"a.css" layer')).toMatchObject({ url: 'a.css', layer: '' });
    expect(parseImport('"a.css" LAYER')).toMatchObject({ layer: '' });
    expect(parseImport('"a.css" layer( base.x )')).toMatchObject({ layer: 'base.x' });
  });

  it('reads `supports(…)` and the media list', () => {
    expect(parseImport('"a.css" supports(display: grid)')).toMatchObject({ supports: 'display: grid' });
    expect(parseImport('"a.css" supports((a) and (b))')).toMatchObject({ supports: '(a) and (b)' });
    expect(parseImport('"a.css" screen and (min-width: 40em)')).toMatchObject({
      media: 'screen and (min-width: 40em)',
    });
  });

  it('reads every combination in the valid order', () => {
    expect(parseImport('url(a.css) layer(x) supports(display: grid) print, screen')).toEqual({
      url: 'a.css',
      urlSpan: { start: 4, end: 9 },
      layer: 'x',
      supports: 'display: grid',
      media: 'print, screen',
    });
    expect(parseImport('"a.css" layer screen')).toMatchObject({ layer: '', media: 'screen' });
    expect(parseImport('"a.css" layer supports(x: y)')).toMatchObject({ layer: '', supports: 'x: y' });
    expect(parseImport('"a.css" supports(x: y) print')).toMatchObject({ supports: 'x: y', media: 'print' });
    // A string with a `)` inside the condition does not close it.
    expect(parseImport('"a.css" supports(content: ")")')).toMatchObject({ supports: 'content: ")"' });
  });

  it.each([
    ['nothing', ''],
    ['no URL', 'screen'],
    ['a bare path', 'a.css'],
    ['a string that never closes', '"a.css'],
    ['a url() that never closes', 'url(a.css'],
    ['an empty url()', 'url()'],
    ['an empty quoted url()', 'url("")'],
    ['a url() with a string that never closes', 'url("a.css)'],
    ['an empty layer()', '"a.css" layer()'],
    ['a layer( that never closes', '"a.css" layer(x'],
    ['a supports( that never closes', '"a.css" supports(x'],
    ['supports before layer', '"a.css" supports(x: y) layer(z)'],
    ['two layers', '"a.css" layer(x) layer(y)'],
    ['a condition in the string of a condition that never closes', '"a.css" supports(content: ")'],
  ])('is null for %s', (_, prelude) => {
    expect(parseImport(prelude)).toBeNull();
  });

  it('is null for two supports()', () => {
    expect(parseImport('"a.css" supports(x) supports(y)')).toBeNull();
  });
});

describe('joinSpec', () => {
  it('resolves a URL against the folder of the file that writes it', () => {
    expect(joinSpec('./styles/main.css', 'tokens.css')).toBe('./styles/tokens.css');
    expect(joinSpec('./styles/main.css', './parts/a.css')).toBe('./styles/parts/a.css');
    expect(joinSpec('./styles/main.css', '../x.css')).toBe('./x.css');
    expect(joinSpec('./main.css', '../../x.css')).toBe('../../x.css');
    expect(joinSpec('../shared/main.css', '../y.css')).toBe('../y.css');
    expect(joinSpec('styles\\main.css', 'a\\b.css')).toBe('./styles/a/b.css');
  });

  it('keeps the query and fragment of the URL, and drops those of the file', () => {
    expect(joinSpec('./main.css?inline', 'f.woff2?v=2#x')).toBe('./f.woff2?v=2#x');
  });
});

describe('the flattened sheet (criterion 5)', () => {
  it('replaces three relative imports by their content, in order', () => {
    const root = '@import "./a.css";\n@import url(b.css);\n@import \'c.css\';\n.root{}';
    const sheet = flat(root, { './a.css': '.a{}', './b.css': '.b{}', './c.css': '.c{}' });
    expect(sheet.css).toBe('.a{}\n.b{}\n.c{}\n.root{}');
    expect(sheet.files).toEqual(['./main.css', './a.css', './b.css', './c.css']);
    expect(sheet.diagnostics).toEqual([]);
  });

  it('turns the conditions into blocks: @layer > @supports > @media', () => {
    const root = '@import "a.css" layer(base) supports(display: grid) screen and (min-width: 40em);';
    expect(flat(root, { './a.css': '.a{}' }).css).toBe(
      '@layer base{@supports (display: grid){@media screen and (min-width: 40em){.a{}}}}',
    );
  });

  it('an anonymous layer, and each condition on its own', () => {
    const files = { './a.css': '.a{}' };
    expect(flat('@import "a.css" layer;', files).css).toBe('@layer{.a{}}');
    expect(flat('@import "a.css" supports(x: y);', files).css).toBe('@supports (x: y){.a{}}');
    expect(flat('@import "a.css" print;', files).css).toBe('@media print{.a{}}');
  });

  it('flattens two levels, each URL relative to its own file', () => {
    const files = {
      './styles/tokens.css': '@import "./color/dark.css" (prefers-color-scheme: dark);\n:root{--a:1}',
      './styles/color/dark.css': ':root{--a:2}',
    };
    const sheet = flat('@import "tokens.css";\np{}', files, './styles/main.css');
    expect(sheet.css).toBe('@media (prefers-color-scheme: dark){:root{--a:2}}\n:root{--a:1}\np{}');
    expect(sheet.files).toEqual(['./styles/main.css', './styles/tokens.css', './styles/color/dark.css']);
  });

  it('normalises the root specifier and ignores its query', () => {
    const { read, asked } = host({ './styles/a.css': '.a{}' });
    const sheet = flattenImports('styles/main.css?inline', '@import "a.css";', read);
    expect(asked).toEqual(['./styles/a.css']);
    expect(sheet.files).toEqual(['./styles/main.css', './styles/a.css']);
  });

  it('keeps `@layer a, b;` before an import and the import still flattened', () => {
    const sheet = flat('@layer a, b;\n@import "a.css";', { './a.css': '.a{}' });
    expect(sheet.css).toBe('@layer a, b;\n.a{}');
    expect(sheet.diagnostics).toEqual([]);
  });

  it('drops an @import the browser would not read, silently', () => {
    expect(flat('@import foo;\n.a{}', {}).css).toBe('\n.a{}');
  });

  it('leaves a sheet without imports as it is', () => {
    const sheet = flat('.a { color: red }', {});
    expect(sheet.css).toBe('.a { color: red }');
    expect(sheet.regions).toEqual([{ flat: { start: 0, end: 17 }, file: './main.css', offset: 0 }]);
    expect(flat('', {}).regions).toEqual([]);
  });
});

describe('url() and @charset (criterion 6)', () => {
  it('rewrites a relative url() of an imported file relative to the .fud', () => {
    const files = {
      './styles/type/fonts.css':
        '@font-face{src:url(../fonts/x.woff2) format("woff2"),url("./y.woff"),url( \'sub/z.ttf\' )}',
    };
    const sheet = flat('@import "type/fonts.css";', files, './styles/main.css');
    expect(sheet.css).toBe(
      '@font-face{src:url(./styles/fonts/x.woff2) format("woff2"),url("./styles/type/y.woff"),url(\'./styles/type/sub/z.ttf\')}',
    );
  });

  it('rewrites the root\'s own relative url(), from its folder', () => {
    expect(flat('.a{background:url(img/a.png)}', {}, './styles/main.css').css).toBe(
      '.a{background:url(./styles/img/a.png)}',
    );
    expect(flat('.a{background:url(a.png)}', {}).css).toBe('.a{background:url(./a.png)}');
  });

  it('a url() that goes up past the .fud stays going up', () => {
    expect(flat('.a{background:url(../../a.png)}', {}, './x/main.css').css).toBe(
      '.a{background:url(../a.png)}',
    );
  });

  it('does not touch an absolute, root, fragment or data: url()', () => {
    const css =
      '.a{a:url(https://cdn/x.png);b:url(/public/x.png);c:url(#f);d:url("data:image/png;base64,AA");e:url(//o/x)}';
    expect(flat(css, {}).css).toBe(css);
  });

  it('drops the @charset of an imported file and keeps the root\'s, first', () => {
    const files = { './a.css': '@charset "utf-8";\n.a{}' };
    const sheet = flat('@charset "utf-8";\n@import "a.css";\n.r{}', files);
    expect(sheet.css).toBe('@charset "utf-8";\n\n.a{}\n.r{}');
    expect(flat('@import "a.css";', files).css).toBe('\n.a{}');
  });
});

describe('a file imported twice (criterion 7)', () => {
  it('appears once, at its last appearance', () => {
    const files = { './a.css': '.a{}', './b.css': '@import "a.css";\n.b{}' };
    // `a` is imported by the root and again by `b`, after it: the last one wins.
    const sheet = flat('@import "a.css";\n@import "b.css";\n.r{}', files);
    expect(sheet.css).toBe('\n.a{}\n.b{}\n.r{}');
    expect(sheet.files).toEqual(['./main.css', './a.css', './b.css']);
  });

  it('appears every time when it declares or opens a layer', () => {
    const files = { './l.css': '@layer x{.l{}}' };
    expect(flat('@import "l.css";\n@import "l.css";', files).css).toBe('@layer x{.l{}}\n@layer x{.l{}}');
  });

  it.each([
    ['a layer statement', '@layer a;'],
    ['a layer nested in a rule', '.p{@layer x{.q{}}}'],
    ['a layer nested in a grouping block', '@media print{@layer x{.q{}}}'],
  ])('a file with %s is layered', (_, css) => {
    expect(flat('@import "l.css";\n@import "l.css";', { './l.css': css }).css).toBe(`${css}\n${css}`);
  });

  it('a file with no layer, in rules or blocks, is not', () => {
    const css = '.p{.q{}}@media print{.r{}}@font-face{x:y}';
    expect(flat('@import "a.css";\n@import "a.css";', { './a.css': css }).css).toBe(`\n${css}`);
  });

  it('with different conditions, they are two imports', () => {
    const files = { './a.css': '.a{}' };
    expect(flat('@import "a.css" print;\n@import "a.css" screen;', files).css).toBe(
      '@media print{.a{}}\n@media screen{.a{}}',
    );
  });

  it('reports a diagnostic of a file imported twice once', () => {
    const files = { './a.css': '.x{}\n@import "z.css";' };
    const sheet = flat('@import "a.css" print;\n@import "a.css" screen;', files);
    expect(sheet.diagnostics.map((d) => d.diagnostic.code)).toEqual([FUD_IMPORT_MISPLACED]);
  });
});

describe('what cannot be flattened (criterion 8)', () => {
  it('a cycle is FUD0856 over the @import that closes it, which is dropped', () => {
    const files = { './a.css': '@import "b.css";\n.a{}', './b.css': '@import "a.css";\n.b{}' };
    const root = '@import "a.css";';
    const sheet = flat(root, files);
    expect(sheet.css).toBe('\n.b{}\n.a{}');
    expect(diags(sheet, files)).toEqual([['./b.css', FUD_IMPORT_CYCLE, 'error', '@import "a.css";']]);
  });

  it('a file importing the root, and a file importing itself, are cycles', () => {
    const files = { './a.css': '@import "main.css";\n@import "a.css";\n.a{}' };
    const sheet = flat('@import "a.css";', files);
    expect(sheet.css).toBe('\n\n.a{}');
    expect(diags(sheet, files)).toEqual([
      ['./a.css', FUD_IMPORT_CYCLE, 'error', '@import "main.css";'],
      ['./a.css', FUD_IMPORT_CYCLE, 'error', '@import "a.css";'],
    ]);
    const self = '@import "./main.css";';
    expect(diags(flat(self, {}), { './main.css': self })).toEqual([
      ['./main.css', FUD_IMPORT_CYCLE, 'error', self],
    ]);
  });

  it('a file that does not exist is FUD0853, dropped; asked for once', () => {
    const files = { './a.css': '@import "gone.css";\n.a{}' };
    const root = '@import "gone.css";\n@import "a.css";';
    const { read, asked } = host(files);
    const sheet = flattenImports('./main.css', root, read);
    expect(sheet.css).toBe('\n\n.a{}');
    expect(asked).toEqual(['./gone.css', './a.css']);
    expect(diags(sheet, { ...files, './main.css': root })).toEqual([
      ['./main.css', FUD_IMPORT_MISSING, 'error', '@import "gone.css";'],
      ['./a.css', FUD_IMPORT_MISSING, 'error', '@import "gone.css";'],
    ]);
    expect(sheet.files).toEqual(['./main.css', './a.css']);
  });

  it('an @import after a rule is FUD0857, dropped and not read', () => {
    const root = '.a{}\n@import "b.css";\n.c{}';
    const { read, asked } = host({ './b.css': '.b{}' });
    const sheet = flattenImports('./main.css', root, read);
    expect(sheet.css).toBe('.a{}\n\n.c{}');
    expect(asked).toEqual([]);
    expect(diags(sheet, { './main.css': root })).toEqual([
      ['./main.css', FUD_IMPORT_MISPLACED, 'warning', '@import "b.css";'],
    ]);
  });

  it('an absolute @import in the root, first, is FUD0850 alone and stays at the top', () => {
    const root = '@charset "utf-8";\n@import url(https://fonts.example/x.css)  screen ;\n.a{}';
    const sheet = flat(root, {});
    expect(sheet.css).toBe('@charset "utf-8";@import url(https://fonts.example/x.css)  screen;\n\n.a{}');
    expect(diags(sheet, { './main.css': root })).toEqual([
      ['./main.css', FUD_IMPORT_EXTERNAL, 'warning', '@import url(https://fonts.example/x.css)  screen ;'],
    ]);
  });

  it.each([
    ['another origin', '//cdn.example/x.css'],
    ['public/', '/x.css'],
    ['a fragment', '#x'],
    ['an empty URL', ''],
  ])('an @import of %s is FUD0850 too', (_, url) => {
    const root = `@import "${url}";\n.a{}`;
    const sheet = flat(root, {});
    expect(sheet.css).toBe(`@import "${url}";\n.a{}`);
    expect(sheet.diagnostics.map((d) => d.diagnostic.code)).toEqual([FUD_IMPORT_EXTERNAL]);
  });

  it('FUD0858 when it was in an imported file', () => {
    const files = { './a.css': '@import "https://x/y.css";\n.a{}' };
    const sheet = flat('.r0{}', {});
    expect(sheet.diagnostics).toEqual([]);
    const nested = flat('@import "a.css";\n.r{}', files);
    expect(nested.css).toBe('@import "https://x/y.css";\n.a{}\n.r{}');
    expect(diags(nested, files)).toEqual([
      ['./a.css', FUD_IMPORT_EXTERNAL, 'warning', '@import "https://x/y.css";'],
      ['./a.css', FUD_IMPORT_REORDERED, 'warning', '@import "https://x/y.css";'],
    ]);
  });

  it('FUD0858 when it was behind a flattened @import', () => {
    const root = '@import "a.css";\n@import "https://x/y.css";\n.r{}';
    const sheet = flat(root, { './a.css': '.a{}' });
    expect(sheet.css).toBe('@import "https://x/y.css";.a{}\n\n.r{}');
    expect(sheet.diagnostics.map((d) => d.diagnostic.code)).toEqual([FUD_IMPORT_EXTERNAL, FUD_IMPORT_REORDERED]);
  });

  it('hoists the same external @import once', () => {
    const files = { './a.css': '@import "https://x/y.css";' };
    const sheet = flat('@import "https://x/y.css";\n@import "a.css" print;', files);
    expect(sheet.css).toBe('@import "https://x/y.css";\n@media print{}');
  });
});

describe('back to the original files (criterion 9)', () => {
  const files = {
    './styles/a.css': '.a{background:url(i.png)}',
  };
  const root = '@import "a.css" print;\n.r{}';
  const sheet = flat(root, files, './styles/main.css');

  it('maps every offset back to its file and offset', () => {
    expect(sheet.css).toBe('@media print{.a{background:url(./styles/i.png)}}\n.r{}');
    const at = (needle: string): number => sheet.css.indexOf(needle);
    // The opening block is written for the `@import`: it maps to the `@import`.
    expect(originOf(sheet, 0)).toEqual({ file: './styles/main.css', offset: 0 });
    expect(originOf(sheet, at('.a'))).toEqual({ file: './styles/a.css', offset: 0 });
    expect(originOf(sheet, at('background'))).toEqual({ file: './styles/a.css', offset: 3 });
    // A rewritten url() maps to the start of the url() it was.
    expect(originOf(sheet, at('url('))).toEqual({ file: './styles/a.css', offset: 14 });
    expect(originOf(sheet, at('}}'))).toEqual({ file: './styles/a.css', offset: 24 });
    expect(originOf(sheet, at('.r'))).toEqual({ file: './styles/main.css', offset: root.indexOf('.r') });
  });

  it('clamps an offset past the end to the end of the last region', () => {
    expect(originOf(sheet, 10_000)).toEqual({ file: './styles/main.css', offset: root.length });
  });

  it('an offset before every region is the root\'s start', () => {
    expect(originOf(sheet, -1)).toEqual({ file: './styles/main.css', offset: 0 });
    expect(originOf(flat('', {}), 0)).toEqual({ file: './main.css', offset: 0 });
    expect(originOf({ css: '', regions: [], files: [], diagnostics: [] }, 0)).toEqual({ file: '', offset: 0 });
  });

  it('maps the hoisted head: the root @charset and an external @import', () => {
    const r = '@charset "x";\n@import "a.css";\n@import "https://e/x.css";';
    const s = flat(r, { './a.css': '.a{}' });
    expect(s.css).toBe('@charset "x";@import "https://e/x.css";\n.a{}\n');
    expect(originOf(s, 0)).toEqual({ file: './main.css', offset: 0 });
    expect(originOf(s, 13)).toEqual({ file: './main.css', offset: r.indexOf('@import "https') });
    expect(originOf(s, s.css.indexOf('.a'))).toEqual({ file: './a.css', offset: 0 });
  });

  it('lists every file read, each once', () => {
    const fs = { './a.css': '@import "b.css";', './b.css': '.b{}' };
    expect(flat('@import "a.css";\n@import "b.css";\n@import "a.css" print;', fs).files).toEqual([
      './main.css',
      './a.css',
      './b.css',
    ]);
  });
});

describe('plainSheet', () => {
  it('is one region over one file, or none for an empty text', () => {
    expect(plainSheet('./s.css', '.a{}')).toEqual({
      css: '.a{}',
      regions: [{ flat: { start: 0, end: 4 }, file: './s.css', offset: 0 }],
      files: ['./s.css'],
      diagnostics: [],
    });
    expect(plainSheet('./s.css', '').regions).toEqual([]);
  });
});
