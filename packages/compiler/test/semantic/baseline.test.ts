/**
 * SDD-83 §3.6, criteria 18–20 and 26 — the HTML and CSS detectors of a `.fud`, and the judge that
 * turns what they find into `FUD1524`.
 *
 * Every test fixes the data's date (criterion 17): with `AS_OF` 2026-10-27, `widely` cuts on
 * 2024-04-27.
 */

import { describe, expect, it } from 'vitest';
import { analyze, judgeUse, type BaselineContext } from '../../src/semantic/index.js';
import { cssBaselineUses } from '../../src/css/index.js';
import { viewInput } from './_view.js';

const AS_OF = '2026-10-27';
const widely: BaselineContext = { target: 'widely', allow: new Set(), asOf: AS_OF };

const component = (inner: string, style = ''): string =>
  `<head><style>${style}</style></head>\n<app-test>\n  <template shadowrootmode="open">${inner}</template>\n</app-test>\n`;

/** The `FUD1524` of `source` under `context`, as `text-under-it key`. */
function warned(source: string, context: BaselineContext = widely): readonly string[] {
  return analyze({ ...viewInput(source), baseline: context })
    .diagnostics.filter((d) => d.code === 'FUD1524')
    .map((d) => `${source.slice(d.span.start, d.span.end)} ${/\(([^)]+)\)/u.exec(d.message)![1]}`);
}

const markup = (inner: string, context?: BaselineContext): readonly string[] => warned(component(inner), context);
const style = (css: string, context?: BaselineContext): readonly string[] => warned(component('', css), context);

describe('the judge', () => {
  it('says the dates, the level and the browsers', () => {
    const found = judgeUse({ name: 'field-sizing', key: 'css.properties.field-sizing', span: { start: 0, end: 1 } }, widely);
    expect(found?.message).toContain('`field-sizing` (css.properties.field-sizing) is newer than this project');
    expect(found?.message).toContain('(widely available): newly available on');
    expect(found?.message).toMatch(/widely available on \d{4}-\d{2}-\d{2}\. Chrome \d+/u);
    expect(found?.severity).toBe('warning');
  });

  it('names the browsers a key has not reached', () => {
    const found = judgeUse({ name: 'closedby', key: 'html.elements.dialog.closedby', span: { start: 0, end: 1 } }, widely);
    expect(found?.message).toContain('not yet in every core browser (missing Safari, Safari on iOS)');
  });

  it('names a mobile browser by its own name, not the desktop one that has the key', () => {
    const found = judgeUse({ name: 'resize', key: 'css.properties.resize', span: { start: 0, end: 1 } }, widely);
    expect(found?.message).toContain('(missing Firefox on Android, Safari on iOS). Chrome 1, Edge 79, Firefox 4, Safari 3');
  });

  it('a key that passes, one it does not have, one allowed and one fudic emits say nothing', () => {
    const at = { start: 0, end: 1 };
    expect(judgeUse({ name: 'popover', key: 'html.global_attributes.popover', span: at }, widely)).toBeUndefined();
    expect(judgeUse({ name: 'x', key: 'css.properties.nothing-like-this', span: at }, widely)).toBeUndefined();
    const allowed = { ...widely, allow: new Set(['field-sizing']) };
    expect(judgeUse({ name: 'field-sizing', key: 'css.properties.field-sizing', span: at }, allowed)).toBeUndefined();
    const own = { name: 'shadowrootmode', key: 'html.elements.template.shadowrootmode', span: at };
    expect(judgeUse(own, { ...widely, target: 2023 })).toBeUndefined();
  });

  it('a key whose remedy is the runtime’s own still warns in the author’s code; one on the root template does not', () => {
    const at = { start: 0, end: 1 };
    const idle = judgeUse({ name: 'requestIdleCallback', key: 'api.Window.requestIdleCallback', span: at }, widely);
    expect(idle?.message).toContain('missing Safari');
    const bridge = { name: 'shadowrootreferencetarget', key: 'html.elements.template.shadowrootreferencetarget', span: at };
    expect(judgeUse(bridge, widely)).toBeUndefined();
  });

  it('without a baseline in the input, nothing is judged', () => {
    const source = component('<search></search>', 'textarea { field-sizing: content; }');
    expect(analyze(viewInput(source)).diagnostics.filter((d) => d.code === 'FUD1524')).toEqual([]);
  });
});

describe('the HTML detector (criterion 18)', () => {
  it('an element, on its tag', () => {
    expect(markup('<dialog closedby="any"></dialog>')).toEqual(['closedby html.elements.dialog.closedby']);
    expect(markup('<search></search>', { ...widely, target: 2022 })).toEqual(['search html.elements.search']);
  });

  it('popover passes widely; with an old level it is reported on the attribute', () => {
    expect(markup('<div popover></div>')).toEqual([]);
    expect(markup('<div popover></div>', { ...widely, target: 2023 })).toEqual(['popover html.global_attributes.popover']);
  });

  it('a literal value reads as the value’s key; a bound one as the attribute’s', () => {
    expect(markup('<input type="color">', { ...widely, target: 2016 })).toEqual(['type html.elements.input.type_color']);
    expect(markup('<input type=@kind>', { ...widely, target: 2016 })).toEqual([]);
  });

  it('an event, by the interface of the tag or a base one', () => {
    expect(markup('<div @toggle=@onToggle @beforetoggle=@onToggle></div>', { ...widely, target: 2022 })).toEqual([
      '@beforetoggle api.HTMLElement.beforetoggle_event',
    ]);
  });

  it('a component and fudic’s syntax are not HTML', () => {
    expect(markup('<app-menu popover closedby="any"></app-menu>')).toEqual([]);
    expect(markup('<div .closedby=@x class:closedby=@y></div>')).toEqual([]);
  });

  it('a tag, an event or a value the table does not have, and an attribute that is not HTML, say nothing', () => {
    expect(markup('<blink></blink><div @notanevent=@x></div><input type="a b">', { ...widely, target: 2015 })).toEqual([]);
    expect(markup('<svg viewBox="0 0 1 1"></svg><div bus:(x)=@h></div>')).toEqual([]);
  });

  it('svg and math elements by their own keys', () => {
    expect(markup('<svg><circle></circle></svg>')).toEqual([]);
    expect(markup('<math><mi>x</mi></math>', { ...widely, target: 2022 })).toEqual(['math mathml.elements.math', 'mi mathml.elements.mi']);
  });
});

describe('what fudic puts (criterion 26)', () => {
  it('shadowrootmode on the root template never warns, not even in 2023', () => {
    expect(markup('', { ...widely, target: 2023 })).toEqual([]);
  });

  it('shadowrootclonable written by the author warns in widely', () => {
    const source = '<app-test>\n  <template shadowrootmode="open" shadowrootclonable></template>\n</app-test>\n';
    expect(warned(source)).toEqual(['shadowrootclonable html.elements.template.shadowrootclonable']);
  });
});

describe('the CSS detector (criteria 19 and 20)', () => {
  it('a property, its value and a function', () => {
    expect(style('textarea { field-sizing: content; }')).toEqual([
      'field-sizing css.properties.field-sizing',
      'content css.properties.field-sizing.content',
    ]);
    expect(style('p { color: light-dark(red, blue); }', { ...widely, target: 2022 })).toEqual([
      'light-dark css.types.color.light-dark',
    ]);
  });

  it('a selector, nesting, an at-rule and a unit', () => {
    expect(style(':host(:state(open)) { color: red; }')).toEqual([':state css.selectors.state']);
    expect(style('.a { & .b { color: red; } }', { ...widely, target: 2022 })).toEqual(['& css.selectors.nesting']);
    expect(style('@scope (.card) { p { color: red; } }', { ...widely, target: 2022 })).toEqual(['@scope css.at-rules.scope']);
    expect(style('main { height: 100dvh; }', { ...widely, target: 2021 })).toEqual(['dvh css.types.length.viewport_percentage_units_dynamic']);
  });

  it('custom properties and vendor prefixes are not looked at', () => {
    expect(style('p { --field-sizing: content; -webkit-field-sizing: content; }')).toEqual([]);
    expect(style('p::-webkit-scrollbar { color: red; }')).toEqual([]);
  });

  it('@supports guards what its condition names, and only that', () => {
    expect(style('@supports (field-sizing: content) { textarea { field-sizing: content; } }')).toEqual([]);
    expect(style('@supports (field-sizing: content) { textarea { field-sizing: content; interpolate-size: allow-keywords; } }')).toEqual([
      'interpolate-size css.properties.interpolate-size',
    ]);
    expect(style('@supports selector(:state(open)) { :host(:state(open)) { color: red; } }')).toEqual([]);
    expect(style('@supports not (field-sizing: content) { p { color: red; } }')).toEqual([]);
  });

  it('strings, attribute selectors and an unknown word say nothing', () => {
    expect(style('p::after { content: ":state(x) light-dark()"; } [data-x=":state(y)"] { color: red; }')).toEqual([]);
    expect(style('p { color: foo(1); width: 3px; }')).toEqual([]);
    // A keyword the data gives no date — `pointer` lacks Safari on iOS, which has no cursor — is a gap of the data.
    expect(style('a { cursor: pointer; }')).toEqual([]);
  });

  it('what the table does not have, a block of declarations and a comment in a condition', () => {
    expect(style('p { not-a-property: 1; } p:not-a-pseudo { color: red; } @not-a-rule; @-webkit-keyframes x { }')).toEqual([]);
    // `@font-face` holds declarations, not rules: its block is not read.
    expect(style('@font-face { field-sizing: content; }')).toEqual([]);
    // An unclosed `(` in a comment of the condition reads to the end; the real test still guards.
    expect(style('@supports /* ( */ (field-sizing: content) { textarea { field-sizing: content; } }')).toEqual([]);
  });

  it('a function with several keys counts as its oldest', () => {
    // `color()` is `css.types.color` (always there) as much as the newer `css.types.color.color`.
    expect(style('p { color: color(srgb 1 0 0); }', { ...widely, target: 2016 })).toEqual([]);
  });

  it('moves the spans by the offset it is given', () => {
    const [use] = cssBaselineUses('a { field-sizing: content }', 10);
    expect(use).toEqual({ name: 'field-sizing', key: 'css.properties.field-sizing', span: { start: 14, end: 26 } });
  });
});
