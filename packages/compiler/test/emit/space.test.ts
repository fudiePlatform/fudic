/**
 * The whitespace model (BUG-07 §4.4, §4.5), unit by unit. `minify.test.ts` proves the
 * emit uses it; this proves the rules themselves, including the ones a page fixture does
 * not naturally reach — Razor inside a `<style>`, an interpolated escape attribute.
 *
 * Every node here comes from the REAL parser, never hand-forged: the point of doing this
 * in the emit rather than over the generated text is that the facts are parsed, so a test
 * that forges them would be testing nothing.
 */
import { describe, expect, it } from 'vitest';
import { spaceModeOf, nestedSpaceMode, collapseSpace, SPACE_ATTR } from '../../src/emit/space.js';
import type { StyleNode } from '../../src/css/index.js';
import type { ElementNode } from '../../src/html/index.js';
import { parse } from './_support.js';

/** The `<style>` body of a one-component `.fud`, as the parser produces it. */
function styleOf(css: string): StyleNode {
  const doc = parse(`<head><style>${css}</style></head>\n<m-el><template shadowrootmode="open"></template></m-el>`);
  const head = (doc as { head?: ElementNode }).head!;
  const style = head.children.find(
    (c): c is ElementNode => c.type === 'element' && c.name === 'style',
  )!;
  return style.children[0] as StyleNode;
}

/** The first element of a component template, parsed. */
function elementOf(markup: string): ElementNode {
  const doc = parse(`<m-el><template shadowrootmode="open">${markup}</template></m-el>`);
  const template = (doc as { template?: ElementNode }).template!;
  return template.children.find((c): c is ElementNode => c.type === 'element')!;
}

describe('spaceModeOf', () => {
  it('preserves the two structurally preformatted elements, whatever the CSS says', () => {
    // A fixed list and not a CSS lookup: a restyled `<pre>` is still a `<pre>` in source.
    expect(spaceModeOf('pre', null)).toBe('preserve');
    expect(spaceModeOf('textarea', null)).toBe('preserve');
    expect(spaceModeOf('PRE', null)).toBe('preserve');
  });

  it('collapses an ordinary element, and a custom element too', () => {
    expect(spaceModeOf('div', null)).toBe('collapse');
    // The case every external minifier gets wrong: an unknown tag is a custom element,
    // its default display is `inline`, so the whitespace around it renders.
    expect(spaceModeOf('app-card', null)).toBe('collapse');
  });

  it('preserves when the component’s own <style> declares a preserving white-space', () => {
    for (const value of ['pre', 'pre-wrap', 'pre-line', 'break-spaces', 'preserve']) {
      expect(spaceModeOf('m-el', styleOf(`:host { white-space: ${value}; }`))).toBe('preserve');
    }
    // CSS Text 4 spells it as its own property too.
    expect(spaceModeOf('m-el', styleOf(':host { white-space-collapse: preserve; }'))).toBe('preserve');
  });

  it('collapses when the stylesheet says something else, or nothing', () => {
    expect(spaceModeOf('m-el', styleOf(':host { white-space: normal; }'))).toBe('collapse');
    expect(spaceModeOf('m-el', styleOf(':host { white-space: nowrap; }'))).toBe('collapse');
    expect(spaceModeOf('m-el', styleOf(':host { display: block; }'))).toBe('collapse');
  });

  it('reads only the LITERAL runs, so a Razor interpolation is not mistaken for CSS', () => {
    // A `<style>` body is text runs interleaved with Razor atoms (SDD-09). The value of an
    // atom is not knowable here, so it contributes nothing — and `SPACE_ATTR` is the
    // documented answer for anything this cannot deduce.
    expect(spaceModeOf('m-el', styleOf(':host { color: @(theme.fg); }'))).toBe('collapse');
    // The literal part still counts when it is the part that declares it.
    expect(spaceModeOf('m-el', styleOf(':host { color: @(theme.fg); white-space: pre; }'))).toBe(
      'preserve',
    );
  });
});

describe('nestedSpaceMode', () => {
  it('inherits a preserving context downwards: white-space inherits', () => {
    expect(nestedSpaceMode('preserve', elementOf('<span></span>'))).toBe('preserve');
    expect(nestedSpaceMode('collapse', elementOf('<span></span>'))).toBe('collapse');
  });

  it('starts one at a <pre>, and at the explicit attribute', () => {
    expect(nestedSpaceMode('collapse', elementOf('<pre></pre>'))).toBe('preserve');
    expect(nestedSpaceMode('collapse', elementOf(`<div ${SPACE_ATTR}="preserve"></div>`))).toBe(
      'preserve',
    );
  });

  it('ignores the attribute with any other value', () => {
    expect(nestedSpaceMode('collapse', elementOf(`<div ${SPACE_ATTR}="collapse"></div>`))).toBe(
      'collapse',
    );
    expect(nestedSpaceMode('collapse', elementOf('<div data-other="preserve"></div>'))).toBe(
      'collapse',
    );
  });

  it('ignores an INTERPOLATED attribute value: it is not a build-time fact', () => {
    // `data-fud-space="@(mode)"` cannot be resolved here, and guessing `preserve` would
    // silently disable the collapse for a subtree. Unknown means the default.
    expect(nestedSpaceMode('collapse', elementOf(`<div ${SPACE_ATTR}="@(mode)"></div>`))).toBe(
      'collapse',
    );
  });
});

describe('collapseSpace', () => {
  it('collapses a run to ONE space and never returns empty', () => {
    expect(collapseSpace('a   b')).toBe('a b');
    expect(collapseSpace('\n    ')).toBe(' ');
    expect(collapseSpace('  a  b  ')).toBe(' a b ');
  });

  it('does not trim: the edges are inline spacing between elements', () => {
    // Trimming is the deletion of §4.5 by another name — it is what removes the space
    // between two adjacent custom elements, which are inline and where it renders.
    expect(collapseSpace(' x ')).toBe(' x ');
  });

  it('leaves a non-breaking space alone: it is content, not whitespace', () => {
    // The reason the character class is `[ \t\n\f\r]` and not `\s`: `\s` matches U+00A0
    // and the rest of the Unicode spaces, and collapsing one of those into an ordinary
    // space changes what the page renders.
    expect(collapseSpace('a  b')).toBe('a  b');
    expect(collapseSpace('a   b')).toBe('a   b');
  });

  it('handles every HTML space character, and only those', () => {
    expect(collapseSpace('a \t\n\f\r b')).toBe('a b');
  });
});
