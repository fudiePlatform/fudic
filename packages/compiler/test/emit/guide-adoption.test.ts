/**
 * SDD-79 §4.9 — whether a component adopts the pieces of the guide its template needs
 * (`guideAdoptionDiagnostics`, over `templateSurface` as the editor reads a file alone and over
 * `shadowSurface` as the build reads the page), criteria 20–22 at the compiler's level; and the
 * `url()` of an adopted sheet read from its own file (§4.6, criterion 14).
 */

import { describe, expect, it } from 'vitest';
import {
  guideAdoptionDiagnostics,
  resolveDocument,
  shadowSurface,
  templateSurface,
} from '../../src/emit/index.js';
import { projectCss } from '../../src/emit/project-styles.js';
import { rebaseUrls } from '../../src/css/index.js';
import type { GuidePiece } from '../../src/css/index.js';
import type { ComponentDocument } from '../../src/document/index.js';
import type { ElementNode } from '../../src/html/index.js';
import { memoryIo, parse } from './_support.js';

const PIECES: readonly GuidePiece[] = [
  { name: 'h1', path: './h1.css', css: ':where(h1) { margin: 0; }' },
  { name: 'button', path: './button.css', css: ':where(button) { padding: 0; }' },
  { name: 'ul', path: './ul.css', css: ':where(ul) > :where(li) { margin: 0; }' },
  { name: 'ol', path: './ol.css', css: ':where(ol) > :where(li) { margin: 0; }' },
  { name: 'cards', path: './cards.css', css: '.card { padding: 0; }' },
];

/** The root template of a component written with `body` inside it, and the source. */
function templateOf(body: string, adopt?: string): { template: ElementNode; source: string } {
  const attr = adopt === undefined ? '' : ` shadowrootadoptedstylesheets="${adopt}"`;
  const source = `<x-card>\n  <template shadowrootmode="open"${attr}>${body}</template>\n</x-card>\n`;
  const template = (parse(source) as ComponentDocument).template!;
  return { template, source };
}

function check(body: string, adopt?: string) {
  const { template, source } = templateOf(body, adopt);
  const found = guideAdoptionDiagnostics(template, PIECES, templateSurface(template.children));
  return found.map((d) => ({ code: d.code, at: source.slice(d.span.start, d.span.end), message: d.message }));
}

describe('FUD1440: a piece the template needs and does not adopt (criterion 20)', () => {
  it('over the tag of the first element of each kind', () => {
    const found = check('<h1>a</h1><h1>b</h1><p><button>x</button></p>');
    expect(found.map((f) => [f.code, f.at])).toEqual([
      ['FUD1440', 'h1'],
      ['FUD1440', 'button'],
    ]);
  });

  it('every piece the element needs, in one: li is ul and ol', () => {
    const found = check('<ul><li>a</li></ul>', 'ul');
    expect(found.map((f) => [f.code, f.at])).toEqual([['FUD1440', 'li']]);
    expect(found[0]!.message).toContain('ol');
    expect(found[0]!.message).not.toContain('"ul"');
  });

  it('nothing when it is adopted, in any branch', () => {
    expect(check('@if (x) {<h1>a</h1>} else {<button>b</button>}', 'h1 button')).toEqual([]);
  });

  it('inside a control branch, too', () => {
    expect(check('@if (x) {<h1>a</h1>}').map((f) => f.at)).toEqual(['h1']);
  });
});

describe('FUD1441: an adopted piece that styles nothing (criteria 21, 22)', () => {
  it('over the name in the attribute', () => {
    const found = check('<p>x</p>', 'h1');
    expect(found.map((f) => [f.code, f.at])).toEqual([['FUD1441', 'h1']]);
  });

  it('not when the prune is not sure: a class written with an expression', () => {
    expect(check('<div class="@cls">x</div>', 'cards')).toEqual([]);
  });

  it('a class piece the template uses is used', () => {
    expect(check('<div class="card">x</div>', 'cards')).toEqual([]);
    expect(check('<div class="other">x</div>', 'cards').map((f) => f.code)).toEqual(['FUD1441']);
  });

  it('a name that is not a piece is not its business', () => {
    expect(check('<p>x</p>', 'theme')).toEqual([]);
  });

  it('nothing is unused when the surface cannot be known', () => {
    const { template } = templateOf('<p>x</p>', 'h1');
    expect(guideAdoptionDiagnostics(template, PIECES, null)).toEqual([]);
  });
});

describe('nothing to say', () => {
  it('without a template, or without pieces', () => {
    const { template } = templateOf('<h1>x</h1>');
    expect(guideAdoptionDiagnostics(undefined, PIECES, null)).toEqual([]);
    expect(guideAdoptionDiagnostics(template, [], templateSurface(template.children))).toEqual([]);
  });
});

describe('the surface of the build: snippets expanded (criterion 22)', () => {
  it('an h1 a snippet renders inside the component keeps the h1 piece', () => {
    const files = {
      '/app/x-card.fud':
        '<link rel="snippet" href="./parts.fud">\n' +
        '<x-card>\n  <template shadowrootmode="open" shadowrootadoptedstylesheets="h1">@render title()</template>\n</x-card>\n',
      '/app/parts.fud': '@snippet title() {\n  <h1>t</h1>\n}\n',
      '/app/index.fud': '<!DOCTYPE html>\n<html><head><link rel="component" href="./x-card.fud"></head><body><x-card></x-card></body></html>\n',
    };
    const graph = resolveDocument('/app/index.fud', memoryIo(files)).value;
    const template = (graph.components.get('x-card')!.doc as ComponentDocument).template;
    expect(guideAdoptionDiagnostics(template, PIECES, shadowSurface(graph, 'x-card'))).toEqual([]);
  });
});

describe('the url() of an adopted sheet resolve from its file (§4.6, criterion 14)', () => {
  it('rebaseUrls writes each relative url() from the sheet\'s spec', () => {
    const css = 'select { background: url(./icons/arrow.svg), url("../x.png"), url(https://cdn/x.png), url(/abs.png), url(data:x); }';
    expect(rebaseUrls(css, '../libs/guide/select.css')).toBe(
      'select { background: url(../libs/guide/icons/arrow.svg), url("../libs/x.png"), url(https://cdn/x.png), url(/abs.png), url(data:x); }',
    );
  });

  it('projectCss rebases with a spec, and leaves the CSS as written without one', () => {
    const css = 'a { background: url(./i.svg); }';
    expect(projectCss({ specifier: 'a', css, spec: '../lib/a.css' })).toBe('a { background: url(../lib/i.svg); }');
    expect(projectCss({ specifier: 'a', css })).toBe(css);
  });
});
