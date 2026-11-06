/**
 * SDD-79 criteria 2–5: a style guide read (`readGuide`) and which piece styles which element
 * (`piecesForTag`). Over the guide `fudic new` writes (`packages/cli/templates/guide`), and over
 * guides of a few files held in memory.
 *
 * The compiler opens no file: the host's reader is a map of path → text, and its keys are
 * exactly what `readGuide` must have resolved.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { piecesForTag, readGuide, type GuidePiece } from '../../src/css/guide.js';

const TEMPLATE = fileURLToPath(new URL('../../../cli/templates/guide/', import.meta.url));

/** The template's CSS as `./<file>` → text, rendered for a project `shop`. */
function templateFiles(): Record<string, string> {
  const files: Record<string, string> = {};
  for (const name of readdirSync(TEMPLATE).filter((f) => f.endsWith('.css'))) {
    files[`./${name}`] = readFileSync(`${TEMPLATE}${name}`, 'utf8').replaceAll('{{project}}', 'shop');
  }
  return files;
}

/** An in-memory host over `files`: what `readGuide` gets as `textOf`. */
const reader = (files: Record<string, string>) => (path: string): string | undefined => files[path];

const piece = (name: string, css: string): GuidePiece => ({ name, path: `./${name}.css`, css });

describe('readGuide over the template (criterion 2)', () => {
  const files = templateFiles();
  const read = readGuide('./guide.css', reader(files), new Set(['./base.css']));

  it('gives as pieces the files of §4.4, in import order, and neither tokens, document nor base', () => {
    expect(read.diagnostics).toEqual([]);
    expect(read.value.pieces.map((p) => p.name)).toEqual([
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'p', 'blockquote', 'pre', 'code', 'mark', 'small', 'abbr', 'hr', 'address', 'sub',
      'a',
      'ul', 'ol', 'dl',
      'img', 'video', 'audio', 'iframe', 'svg', 'figure',
      'table',
      'fieldset', 'label', 'input', 'select', 'textarea', 'button', 'progress', 'meter', 'output',
      'details', 'dialog', 'popover',
    ]);
  });

  it('keeps each piece as its file, path and text', () => {
    const button = read.value.pieces.find((p) => p.name === 'button')!;
    expect(button.path).toBe('./button.css');
    expect(button.css).toBe(files['./button.css']);
  });

  it('flattens the whole guide for the page: tokens, the document and every piece', () => {
    const css = read.value.sheet.css;
    expect(css).not.toContain('@import');
    expect(css).toContain(':root');
    expect(css).toContain('@font-face');
    expect(css).toContain('box-sizing: border-box');
    expect(css).toContain(':where(button)');
  });

  it('every element the pieces paint is found by its tag (§4.5)', () => {
    const pieces = read.value.pieces;
    expect(piecesForTag(pieces, 'button')).toEqual(['button']);
    expect(piecesForTag(pieces, 'li')).toEqual(['ul', 'ol']);
    expect(piecesForTag(pieces, 'summary')).toEqual(['details']);
    expect(piecesForTag(pieces, 'kbd')).toEqual(['code']);
    expect(piecesForTag(pieces, 'td')).toEqual(['table']);
    expect(piecesForTag(pieces, 'sup')).toEqual(['sub']);
    // `[popover]` paints no element by its tag: it is adopted by hand (§8.2.16).
    expect(pieces.filter((p) => p.name === 'popover').flatMap((p) => piecesForTag([p], 'div'))).toEqual([]);
    expect(piecesForTag(pieces, 'div')).toEqual([]);
  });
});

describe('readGuide over guides of a few files', () => {
  it('FUD1442 over the @import of an adoptable file whose name is not a sheet name; it is no piece (criterion 3)', () => {
    const guide = '@import "./tokens.css";\n@import "./my-button.css";\n';
    const read = readGuide(
      './guide.css',
      reader({ './guide.css': guide, './tokens.css': ':root { --x: 1; }', './my-button.css': 'button { color: red; }' }),
      new Set(),
    );
    expect(read.value.pieces).toEqual([]);
    expect(read.diagnostics).toHaveLength(1);
    const [d] = read.diagnostics;
    expect(d!.code).toBe('FUD1442');
    expect(guide.slice(d!.span.start, d!.span.end)).toBe('@import "./my-button.css";');
  });

  it('a file of :root and @font-face only is no piece and says nothing (criterion 4)', () => {
    const tokens = '@font-face { font-family: X; src: url(./x.woff2); }\n:root { --a: 1; }\nhtml, body { margin: 0; }\n@property --p { syntax: "*"; inherits: true; }\n';
    const read = readGuide('./guide.css', reader({ './guide.css': '@import "./tokens.css";', './tokens.css': tokens }), new Set());
    expect(read.value.pieces).toEqual([]);
    expect(read.diagnostics).toEqual([]);
  });

  it('what a shadow root can use makes a piece; what only the document has does not (§4.3, §8.2.5)', () => {
    const files = {
      './guide.css': [
        '@import "./mediaroot.css";',
        '@import "./mediarule.css";',
        '@import "./isroot.css";',
        '@import "./keyframes.css";',
        '@import "./nested.css";',
        '@import "./broken.css";',
        '@import "./host.css";',
      ].join('\n'),
      './mediaroot.css': '@media (prefers-color-scheme: dark) { :root { --a: 1; } }',
      './mediarule.css': '@media (min-width: 1px) { p { margin: 0; } }',
      './isroot.css': ':is(html, :root) { color: red; }',
      './keyframes.css': '@keyframes spin { to { rotate: 1turn; } }',
      './nested.css': '@import "./other.css";',
      './other.css': 'p {}',
      // A sheet the parser reads no rule from has nothing to adopt.
      './broken.css': 'p[ { color: red; }',
      './host.css': ':host { display: block; }',
    };
    const read = readGuide('./guide.css', reader(files), new Set());
    expect(read.value.pieces.map((p) => p.name)).toEqual(['mediarule', 'keyframes', 'nested', 'host']);
  });

  it('a file of the project globalStyles is no piece, though adoptable', () => {
    const read = readGuide(
      './guide.css',
      reader({ './guide.css': '@import "./base.css";\n@import "./p.css";', './base.css': '* { box-sizing: border-box; }', './p.css': 'p {}' }),
      new Set(['./base.css']),
    );
    expect(read.value.pieces.map((p) => p.name)).toEqual(['p']);
  });

  it('skips what is not a relative import, and a file that is not there', () => {
    const guide = [
      '@import url("https://fonts.example/x.css");',
      '@import "/abs.css";',
      '@import "./missing.css";',
      '@import "./p.css?v=1";',
      '@media print { p { color: black; } }',
      'p { color: red; }',
    ].join('\n');
    const read = readGuide('./guide.css', reader({ './guide.css': guide, './p.css?v=1': 'p {}' }), new Set());
    expect(read.value.pieces).toEqual([{ name: 'p', path: './p.css?v=1', css: 'p {}' }]);
  });

  it('resolves imports from the guide\'s folder, wherever that is', () => {
    const read = readGuide(
      '../libs/guide/guide.css',
      reader({ '../libs/guide/guide.css': '@import "./h1.css";', '../libs/guide/h1.css': 'h1 {}' }),
      new Set(),
    );
    expect(read.value.pieces).toEqual([{ name: 'h1', path: '../libs/guide/h1.css', css: 'h1 {}' }]);
  });

  it('a guide that cannot be read is an empty guide', () => {
    const read = readGuide('./guide.css', reader({}), new Set());
    expect(read.value.pieces).toEqual([]);
    expect(read.value.sheet.css).toBe('');
    expect(read.diagnostics).toEqual([]);
  });
});

describe('piecesForTag (criterion 5)', () => {
  const pieces = [
    piece('button', ':where(button) { padding: 0; }\n:where(button):hover { color: red; }'),
    piece('ul', ':where(ul) > :where(li) { margin: 0; }\nul {}'),
    piece('ol', 'ol li::marker { color: red; }'),
    piece('btn', '.btn { padding: 0; }'),
    piece('all', '* { margin: 0; }'),
    piece('details', '@media (min-width: 1px) { :where(summary) { cursor: pointer; } }\n:is(details) {}'),
    piece('broken', 'p[ {}'),
  ];

  it('gives the pieces whose rules have the tag in their subject', () => {
    expect(piecesForTag(pieces, 'button')).toEqual(['button']);
    expect(piecesForTag(pieces, 'li')).toEqual(['ul', 'ol']);
    expect(piecesForTag(pieces, 'ul')).toEqual(['ul']);
  });

  it('a class or the universal selector styles no tag', () => {
    expect(piecesForTag(pieces, 'div')).toEqual([]);
    expect(piecesForTag(pieces, 'p')).toEqual([]);
  });

  it(':where() and :is() count, inside an at-rule too', () => {
    expect(piecesForTag(pieces, 'summary')).toEqual(['details']);
    expect(piecesForTag(pieces, 'details')).toEqual(['details']);
  });

  it('a selector it cannot read, a rule with no block, an at-rule with declarations: no tag', () => {
    const odd = piece('odd', '@charset "utf-8";\n@font-face { font-family: X; }\np:::nope { color: red; }\nem { color: red; }');
    expect(piecesForTag([odd], 'p')).toEqual([]);
    expect(piecesForTag([odd], 'em')).toEqual(['odd']);
  });

  it('reads the tag without regard to case, and a piece once', () => {
    expect(piecesForTag(pieces, 'BUTTON')).toEqual(['button']);
    expect(piecesForTag(pieces, 'button')).toEqual(['button']);
  });
});
