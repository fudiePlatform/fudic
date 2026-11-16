/**
 * SDD-83 §3.11, criteria 32 and 33, on the functions: the bulbs of a `FUD1524` and of the Baseline
 * warnings of a `fudic.json`. «Move to `@supports`» leaves a rule that warns about nothing new.
 */

import { describe, expect, it } from 'vitest';
import type { CodeAction, TextEdit as LspEdit } from '@volar/language-service';
import { cssBaselineUses, judgeUses } from '@fudic/compiler';
import { FUD1521, FUD1524, FUD1525, FUD1526, FUD1527, FUD1528, type FudCode } from '@fudic/diagnostics';
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
  baselineFeatureActions,
  configFileActions,
  featuresOfLibraryMessage,
  FLOOR_YEAR,
  keyOfBaselineMessage,
  OPEN_URL_COMMAND,
  supportsFixes,
  type CssFix,
} from '../../src/services/baseline-actions.js';

const widely = { target: 'widely' as const, allow: new Set<string>() };

/** The sheet once a fix is in it. */
const fixed = (css: string, fix: CssFix | undefined): string =>
  [...(fix?.edits ?? [])].sort((a, b) => b.span.start - a.span.start).reduce((text, e) => text.slice(0, e.span.start) + e.newText + text.slice(e.span.end), css);

/** The span of `needle` in `css`, the `nth` time it appears. */
const at = (css: string, needle: string, nth = 0) => {
  let start = -1;
  for (let i = 0; i <= nth; i++) start = css.indexOf(needle, start + 1);
  return { start, end: start + needle.length };
};

const warned = (css: string): string[] => judgeUses(cssBaselineUses(css), widely).map((d) => css.slice(d.span.start, d.span.end));

describe('Move to @supports', () => {
  it('a rule of its own behind the one it leaves, which warns about nothing new (criterion 33)', () => {
    const css = '.a {\n  color: red;\n  field-sizing: content;\n}\n';
    const [fix] = supportsFixes(css, at(css, 'field-sizing'));
    expect(fix!.title).toBe('Move to @supports (field-sizing: content)');
    expect(fixed(css, fix)).toBe('.a {\n  color: red;\n}\n\n@supports (field-sizing: content) {\n  .a { field-sizing: content; }\n}\n');
    expect(warned(css)).toEqual(['field-sizing', 'content']);
    expect(warned(fixed(css, fix))).toEqual([]);
  });

  it('the rule whole when the declaration was all it had; inside the at-rule it sat in', () => {
    const css = '@media (min-width: 1px) {\n  textarea { field-sizing: content }\n}\n';
    const [fix] = supportsFixes(css, at(css, 'content'));
    expect(fixed(css, fix)).toBe('@media (min-width: 1px) {\n  @supports (field-sizing: content) {\n    textarea { field-sizing: content; }\n  }\n}\n');
    expect(warned(fixed(css, fix))).toEqual([]);
  });

  it('the last declaration, written without its `;`', () => {
    const css = '.a {\n  color: red;\n  field-sizing: content\n}';
    const [fix] = supportsFixes(css, at(css, 'field-sizing'));
    expect(fixed(css, fix)).toBe('.a {\n  color: red;\n}\n\n@supports (field-sizing: content) {\n  .a { field-sizing: content; }\n}');
  });

  it('a declaration that shares its line keeps the rest of the line', () => {
    const css = '.a { color: red; height: 100dvh; width: 1px }';
    const [fix] = supportsFixes(css, at(css, 'dvh'));
    expect(fixed(css, fix)).toBe('.a { color: red; width: 1px }\n\n@supports (height: 100dvh) {\n  .a { height: 100dvh; }\n}');
  });
});

describe('Wrap in @supports selector(…)', () => {
  it('the whole rule, re-indented, under the selector it warns about, arguments included', () => {
    const css = 'x-menu {\n  & .item:state(open) {\n    color: red;\n  }\n}\n:host(:state(open)) {\n  color: red;\n}\n';
    const [fix] = supportsFixes(css, at(css, ':state', 1));
    expect(fix!.title).toBe('Wrap in @supports selector(:state(open))');
    expect(fixed(css, fix)).toContain('@supports selector(:state(open)) {\n  :host(:state(open)) {\n    color: red;\n  }\n}');
    expect(warned(fixed(css, fix)).filter((w) => w === ':state')).toHaveLength(1);
  });

  it('a pseudo without arguments is the guard as it is', () => {
    const css = 'a:popover-open { color: red; }';
    expect(supportsFixes(css, at(css, ':popover-open'))[0]!.title).toBe('Wrap in @supports selector(:popover-open)');
  });

  it('nothing in a rule nested in another, on a statement, or outside every rule', () => {
    const css = '.a {\n  .b { field-sizing: content; }\n  &:state(x) { color: red; }\n}\n@import url(x.css);\n';
    expect(supportsFixes(css, at(css, 'field-sizing'))).toEqual([]);
    expect(supportsFixes(css, at(css, ':state'))).toEqual([]);
    expect(supportsFixes(css, at(css, 'import'))).toEqual([]);
    expect(supportsFixes('  ', { start: 1, end: 2 })).toEqual([]);
    expect(supportsFixes('@font-face { src: x }', at('@font-face { src: x }', 'src'))).toEqual([]);
  });
});

describe('Allow it, and see it on webstatus.dev', () => {
  const diagnostic = FUD1524({
    span: { start: 0, end: 1 },
    name: 'field-sizing',
    key: 'css.properties.field-sizing',
    baseline: 'widely available',
    newly: '2026-06-16',
    widely: '2028-12-16',
    support: [],
    missing: [],
  });

  it('reads the key out of the message', () => {
    expect(keyOfBaselineMessage(diagnostic.message)).toBe('css.properties.field-sizing');
    expect(keyOfBaselineMessage('other')).toBeUndefined();
  });

  it('allows the feature in the fudic.json the file obeys, and opens its page', () => {
    const config = { path: '/p/fudic.json', text: '{ "baseline": "widely" }' };
    const [allow, see] = baselineFeatureActions(diagnostic, config);
    expect(allow!.title).toBe('Allow field-sizing in the project');
    const edits = allow!.edit!.changes!['file:///p/fudic.json'] as LspEdit[];
    expect(TextDocument.applyEdits(TextDocument.create('x', 'json', 0, config.text), edits)).toBe(
      '{ "baseline": { "target": "widely", "allow": ["field-sizing"] } }',
    );
    expect(see).toEqual({
      title: 'See field-sizing on webstatus.dev',
      kind: 'quickfix',
      command: { title: 'https://webstatus.dev/features/field-sizing', command: OPEN_URL_COMMAND, arguments: ['https://webstatus.dev/features/field-sizing'] },
    });
  });

  it('without a fudic.json, or with one already allowing it, only the page; a key of two features, both', () => {
    expect(baselineFeatureActions(diagnostic, undefined).map((a) => a.title)).toEqual(['See field-sizing on webstatus.dev']);
    const allowing = { path: '/p/fudic.json', text: '{ "baseline": { "allow": ["field-sizing"] } }' };
    expect(baselineFeatureActions(diagnostic, allowing).map((a) => a.title)).toEqual(['See field-sizing on webstatus.dev']);
    expect(baselineFeatureActions({ ...diagnostic, message: 'no key here' }, undefined)).toEqual([]);
    const media = { ...diagnostic, message: diagnostic.message.replace('css.properties.field-sizing', 'api.HTMLMediaElement.play') };
    expect(baselineFeatureActions(media, undefined).length).toBeGreaterThanOrEqual(1);
    expect(baselineFeatureActions({ ...diagnostic, message: diagnostic.message.replace('css.properties.field-sizing', 'css.properties.nothing') }, undefined)).toEqual([]);
  });
});

describe('the bulbs of a fudic.json', () => {
  const FILE = 'file:///p/fudic.json';
  const run = (text: string, d: { code: FudCode; span?: { start: number; end: number } | undefined; message: string }): Record<string, string> => {
    const actions: CodeAction[] = configFileActions({ path: '/p/fudic.json', text }, [{ code: d.code, span: d.span ?? { start: 0, end: 0 }, message: d.message }]);
    return Object.fromEntries(
      actions.map((a) => [a.title, TextDocument.applyEdits(TextDocument.create(FILE, 'json', 0, text), a.edit!.changes![FILE] as LspEdit[])]),
    );
  };

  it('FUD1521: remove the entry that lowers an error', () => {
    const text = '{ "diagnostics": { "FUD0051": "off" } }';
    const d = FUD1521({ place: 'policy', file: 'fudic.json', code: 'FUD0051', level: 'off', span: at(text, '"FUD0051"') });
    expect(run(text, d)).toEqual({ Remove: '{ "diagnostics": {} }' });
  });

  it('FUD1525: raise the level to the floor year, and turn it off', () => {
    const text = '{ "baseline": 2023 }';
    const d = FUD1525({ file: 'fudic.json', span: at(text, '"baseline"'), floor: '2024-03-05', features: [], baseline: 'Baseline 2023', cutoff: '2023-12-31' });
    expect(FLOOR_YEAR).toBe(2024);
    expect(run(text, d)).toEqual({ 'Raise to 2024': '{ "baseline": 2024 }', 'Turn FUD1525 off in the project': '{ "baseline": 2023, "diagnostics": { "FUD1525": "off" } }' });
  });

  it('FUD1526: allow what the library uses', () => {
    const d = FUD1526({ file: 'fudic.json', library: '@acme/ui', features: ['popover', 'field-sizing'] });
    expect(featuresOfLibraryMessage(d.message)).toEqual(['popover', 'field-sizing']);
    expect(featuresOfLibraryMessage('x')).toEqual([]);
    expect(run('{}', d)['Allow them in the app']).toBe('{ "baseline": { "target": "widely", "allow": ["popover", "field-sizing"] } }');
  });

  it('FUD1527: change an id that moved or was split; nothing for one that never existed', () => {
    const moved = '{ "baseline": { "allow": ["masonry"] } }';
    expect(run(moved, FUD1527({ file: 'fudic.json', id: 'masonry', kind: 'moved', to: ['grid-lanes'], span: at(moved, '"masonry"') }))['Change to grid-lanes']).toBe(
      '{ "baseline": { "allow": ["grid-lanes"] } }',
    );
    const split = '{ "baseline": { "allow": ["text-wrap-style"] } }';
    const titles = Object.keys(run(split, FUD1527({ file: 'fudic.json', id: 'text-wrap-style', kind: 'split', to: [], span: at(split, '"text-wrap-style"') })));
    expect(titles[0]).toMatch(/^Change to .+, .+/u);
    const none = '{ "baseline": { "allow": ["nada", "popover"] } }';
    expect(Object.keys(run(none, FUD1527({ file: 'fudic.json', id: 'nada', span: at(none, '"nada"') })))).toEqual(['Turn FUD1527 off in the project']);
    expect(Object.keys(run(none, FUD1527({ file: 'fudic.json', id: 'popover', span: at(none, '"popover"') })))).toEqual(['Turn FUD1527 off in the project']);
    // With no span, the reader could not point at the id: nothing to change.
    expect(Object.keys(run(none, FUD1527({ file: 'fudic.json', id: 'nada' })))).toEqual(['Turn FUD1527 off in the project']);
  });

  it('FUD1528: remove an id nothing uses; a code with no repair only turns off', () => {
    const text = '{ "baseline": { "allow": ["popover"] } }';
    expect(run(text, FUD1528({ file: 'fudic.json', id: 'popover', span: at(text, '"popover"') }))['Remove']).toBe('{ "baseline": { "allow": [] } }');
    expect(Object.keys(run('{', { code: 'FUD0725', message: '' }))).toEqual([]);
  });
});
