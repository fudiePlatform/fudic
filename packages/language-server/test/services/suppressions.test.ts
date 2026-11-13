/**
 * SDD-83 §3.11, criteria 32 and 34, on the functions: the bulbs that write and take out a
 * `fud-disable` comment, the completion of its codes and the hover over one.
 */

import { describe, expect, it } from 'vitest';
import type { CodeAction, TextEdit } from '@volar/language-service';
import { FUD1380, FUD1523, type FudCode, type Policy } from '@fudic/diagnostics';
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
  codeCompletionList,
  codeCompletions,
  codeHover,
  codeHoverAt,
  codeSlotAt,
  CSS_COMMENT,
  hashFileActions,
  HASH_COMMENT,
  nearbyCodes,
  PLACE_CURSOR_COMMAND,
  RAZOR_COMMENT,
  removeCodesEdit,
  SCRIPT_COMMENT,
  silenceable,
  suppressionActions,
  unusedCodes,
  type SilenceTarget,
} from '../../src/services/suppressions.js';

const URI_ = 'file:///p/src/app-x.fud';

/** The text once the edits an action makes to `uri` are in it. */
function applied(text: string, action: CodeAction | undefined, uri = URI_): string {
  const edits = (action?.edit?.changes?.[uri] ?? []) as TextEdit[];
  const doc = TextDocument.create(uri, 'plain', 0, text);
  return TextDocument.applyEdits(doc, edits);
}

const target = (text: string, extra: Partial<SilenceTarget> = {}): SilenceTarget => ({
  uri: URI_,
  path: '/p/src/app-x.fud',
  text,
  lineDelimiters: () => RAZOR_COMMENT,
  fileDelimiters: RAZOR_COMMENT,
  ...extra,
});

const loopAt = (text: string, needle: string) => {
  const start = text.indexOf(needle);
  return FUD1380({ span: { start, end: start + needle.length }, event: 'click' });
};

describe('silence a code where it occurs', () => {
  const TEXT = '<ul>\n    <li @click=@x>a</li>\n</ul>\n';

  it('on its line: a comment above it with its indent, the cursor on the reason', () => {
    const actions = suppressionActions(target(TEXT), [loopAt(TEXT, '@click')]);
    const line = actions.find((a) => a.title === 'Silence FUD1380 on this line')!;
    expect(applied(TEXT, line)).toBe('<ul>\n    @* fud-disable-next-line FUD1380:  *@\n    <li @click=@x>a</li>\n</ul>\n');
    expect(line.command).toEqual({ title: 'Write the reason', command: PLACE_CURSOR_COMMAND, arguments: ['file:///p/src/app-x.fud', 1, 38] });
  });

  it('on the first line of the file, with nothing above it', () => {
    const text = '<li @click=@x>a</li>\n';
    const line = suppressionActions(target(text), [loopAt(text, '@click')])[0]!;
    expect(applied(text, line)).toBe('@* fud-disable-next-line FUD1380:  *@\n<li @click=@x>a</li>\n');
  });

  it('in the file: a comment at the top', () => {
    const actions = suppressionActions(target(TEXT), [loopAt(TEXT, '@click')]);
    const file = actions.find((a) => a.title === 'Silence FUD1380 in this file')!;
    expect(applied(TEXT, file)).toBe(`@* fud-disable FUD1380:  *@\n${TEXT}`);
    expect(file.command?.arguments).toEqual(['file:///p/src/app-x.fud', 0, 24]);
  });

  it('a line comment has no closer, and the line takes the comment of its region', () => {
    const text = 'a\n  b\n';
    const at = { span: { start: 4, end: 5 }, code: 'FUD1380' as FudCode, message: '' };
    const actions = suppressionActions(target(text, { lineDelimiters: () => SCRIPT_COMMENT, fileDelimiters: HASH_COMMENT }), [at]);
    expect(applied(text, actions[0])).toBe('a\n  // fud-disable-next-line FUD1380: \n  b\n');
    expect(applied(text, actions[1])).toBe('# fud-disable FUD1380: \na\n  b\n');
    const css = suppressionActions(target(text, { lineDelimiters: () => CSS_COMMENT }), [at]);
    expect(applied(text, css[0])).toBe('a\n  /* fud-disable-next-line FUD1380:  */\n  b\n');
  });

  it('joins a directive already there instead of writing a second one', () => {
    const text = '@* fud-disable FUD1022: x *@\n<ul>\n  @* fud-disable-next-line FUD1022: y *@\n  <li @click=@x>a</li>\n</ul>\n';
    const actions = suppressionActions(target(text), [loopAt(text, '@click')]);
    const line = actions.find((a) => a.title === 'Silence FUD1380 on this line')!;
    expect(applied(text, line)).toContain('@* fud-disable-next-line FUD1022, FUD1380: y *@');
    expect(line.command).toBeUndefined();
    expect(applied(text, actions.find((a) => a.title === 'Silence FUD1380 in this file'))).toContain('@* fud-disable FUD1022, FUD1380: x *@');
  });

  it('a directive of the other scope above is not joined', () => {
    const text = '@* fud-disable FUD1022: x *@\n<li @click=@x>a</li>\n';
    const line = suppressionActions(target(text), [loopAt(text, '@click')]).find((a) => a.title === 'Silence FUD1380 on this line')!;
    expect(applied(text, line)).toBe('@* fud-disable FUD1022: x *@\n@* fud-disable-next-line FUD1380:  *@\n<li @click=@x>a</li>\n');
  });

  it('turns the code off in the project when the file obeys a fudic.json, which is edited on disk', () => {
    const config = { path: '/p/fudic.json', text: '{ "id": "p" }' };
    const actions = suppressionActions(target(TEXT, { config }), [loopAt(TEXT, '@click')]);
    const off = actions.find((a) => a.title === 'Turn FUD1380 off in the project')!;
    expect(applied(config.text, off, 'file:///p/fudic.json')).toBe('{ "id": "p", "diagnostics": { "FUD1380": "off" } }');
    expect(suppressionActions(target(TEXT, { config: { path: '/p/fudic.json', text: '[]' } }), [loopAt(TEXT, '@click')]).map((a) => a.title)).not.toContain(
      'Turn FUD1380 off in the project',
    );
  });

  it('only a code that is not an error by default, and not one about comments themselves', () => {
    expect(silenceable('FUD1380')).toBe(true);
    expect(silenceable('FUD0051')).toBe(false);
    expect(silenceable('FUD0050')).toBe(false);
    expect(silenceable('FUD9999')).toBe(false);
    const at = { span: { start: 0, end: 1 }, message: '' };
    expect(suppressionActions(target('x'), [{ ...at, code: 'FUD0051' }, { ...at, code: 'FUD1520' }])).toEqual([]);
  });
});

describe('take out what a comment says to no effect', () => {
  it('FUD1523: the whole comment and its line, when none of its codes silenced anything', () => {
    const text = '<p>\n  @* fud-disable-next-line FUD1380: x *@\n  <b>a</b>\n</p>\n';
    const start = text.indexOf('@*');
    const end = text.indexOf('*@') + 2;
    const d = FUD1523({ span: { start, end }, codes: ['FUD1380'], scope: 'next-line' });
    const [remove] = suppressionActions(target(text), [d]);
    expect(remove!.title).toBe('Remove');
    expect(applied(text, remove)).toBe('<p>\n  <b>a</b>\n</p>\n');
  });

  it('FUD1523: only its codes, when others of the comment did silence something', () => {
    const text = '@* fud-disable FUD1380, FUD1022: x *@\n';
    const d = FUD1523({ span: { start: 0, end: text.length - 1 }, codes: ['FUD1022'], scope: 'file' });
    expect(applied(text, suppressionActions(target(text), [d])[0])).toBe('@* fud-disable FUD1380: x *@\n');
    expect(unusedCodes(d.message)).toEqual(['FUD1022']);
    expect(unusedCodes(FUD1523({ span: d.span, codes: ['FUD1380', 'FUD1022'], scope: 'file' }).message)).toEqual(['FUD1380', 'FUD1022']);
    expect(unusedCodes('something else')).toEqual([]);
  });

  it('FUD1521: the error code out of the comment, or the comment when it was the only one', () => {
    const text = 'a /* fud-disable-next-line FUD0051: x */ b\n// fud-disable FUD0051, FUD1380: y\n';
    const first = text.indexOf('FUD0051');
    const second = text.indexOf('FUD0051', first + 1);
    const remove = (at: number) => suppressionActions(target(text), [{ code: 'FUD1521', span: { start: at, end: at + 7 }, message: '' }])[0];
    expect(applied(text, remove(first))).toBe('a  b\n// fud-disable FUD0051, FUD1380: y\n');
    expect(applied(text, remove(second))).toBe('a /* fud-disable-next-line FUD0051: x */ b\n// fud-disable FUD1380: y\n');
    const razor = '@* fud-disable-next-line FUD0051: x *@\n<p></p>\n';
    const inRazor = suppressionActions(target(razor), [{ code: 'FUD1521', span: { start: 25, end: 32 }, message: '' }])[0];
    expect(applied(razor, inRazor)).toBe('<p></p>\n');
    // Somewhere that is no directive: nothing to take out.
    expect(suppressionActions(target('plain text'), [{ code: 'FUD1521', span: { start: 0, end: 5 }, message: '' }])).toEqual([]);
    expect(removeCodesEdit('plain', { start: 0, end: 5 }, ['FUD1380'])).toBeUndefined();
  });
});

describe('completion and hover in a directive', () => {
  it('a code slot after the keyword and after a comma; nowhere else', () => {
    expect(codeSlotAt('x\n@* fud-disable-next-line FU', 29)).toEqual({ start: 27, scope: 'next-line', line: 1 });
    expect(codeSlotAt('# fud-disable FUD1380, ', 23)).toEqual({ start: 23, scope: 'file', line: 0 });
    expect(codeSlotAt('<p>fud-disable x', 16)).toBeUndefined();
    expect(codeSlotAt('// fud-disable FUD1380: why', 27)).toBeUndefined();
  });

  it('the codes that occur where it applies first; never an error', () => {
    const items = codeCompletions(['FUD1380']);
    expect(items.find((c) => c.code === 'FUD1380')!.sortText).toBe('0FUD1380');
    expect(items.find((c) => c.code === 'FUD1022')!.sortText).toBe('1FUD1022');
    expect(items.find((c) => c.code === 'FUD1022')!.detail).toMatch(/^warning — /u);
    expect(items.some((c) => c.code === 'FUD0051')).toBe(false);

    const text = '// fud-disable-next-line \na\nb';
    const near = [
      { code: 'FUD1380' as FudCode, span: { start: 26, end: 27 } },
      { code: 'FUD1022' as FudCode, span: { start: 28, end: 29 } },
    ];
    expect(nearbyCodes({ start: 25, scope: 'next-line', line: 0 }, text, near)).toEqual(['FUD1380']);
    expect(nearbyCodes({ start: 25, scope: 'file', line: 0 }, text, near)).toEqual(['FUD1380', 'FUD1022']);

    const doc = TextDocument.create(URI_, 'fud', 1, text);
    const list = codeCompletionList(doc, 25, () => ['FUD1380'])!;
    expect(list.items.find((i) => i.label === 'FUD1380')).toMatchObject({ sortText: '0FUD1380', textEdit: { newText: 'FUD1380' } });
    expect(codeCompletionList(doc, 27, () => [])).toBeUndefined();
  });

  it('the hover over a code: its title, and how this project reports it', () => {
    const text = '@* fud-disable-next-line FUD1380, FUD0050, FUD9999: x *@';
    const raised: Policy = { codes: new Map(), warnings: 'error' };
    expect(codeHoverAt(text, 27, null)!.markdown).toMatch(/^\*\*FUD1380\*\* — .+\n\nWarning\.$/u);
    expect(codeHoverAt(text, 27, raised)!.markdown).toMatch(/Warning by default; error in this project\.$/u);
    expect(codeHoverAt(text, 36, null)!.markdown).toMatch(/Retired: replaced by FUD0052, FUD0051\.$/u);
    expect(codeHoverAt(text, 45, null)).toBeUndefined();
    expect(codeHoverAt(text, 2, null)).toBeUndefined();
    expect(codeHoverAt('no directive', 2, null)).toBeUndefined();
    const doc = TextDocument.create(URI_, 'fud', 1, text);
    expect(codeHover(doc, 27, null)).toMatchObject({ range: { start: { line: 0, character: 25 }, end: { line: 0, character: 32 } } });
    expect(codeHover(doc, 2, null)).toBeUndefined();
  });

  it('a retired code replaced by nothing says only that it is retired', async () => {
    const { RETIRED } = await import('../../../diagnostics/src/catalog.generated.js');
    const lone = Object.entries(RETIRED).find(([, [, by]]) => by.length === 0);
    expect(lone).toBeDefined();
    expect(codeHoverAt(`# fud-disable ${lone![0]}: x`, 16, null)!.markdown).toMatch(/\n\nRetired\.$/u);
  });
});

describe('a file whose comments are # lines', () => {
  it('its bulbs over what it shows between two offsets', () => {
    const text = '# fud-disable FUD1380: x\nrest\n';
    const d = FUD1523({ span: { start: 0, end: 24 }, codes: ['FUD1380'], scope: 'file' });
    const file = { uri: 'file:///p/a.fudapi', path: '/p/a.fudapi', text };
    expect(hashFileActions(file, [d], 0, 5).map((a) => a.title)).toEqual(['Remove']);
    expect(hashFileActions(file, [d], 26, 28)).toEqual([]);
    const loop = { code: 'FUD1380' as FudCode, span: { start: 25, end: 29 }, message: '' };
    expect(applied(text, hashFileActions(file, [loop], 25, 29)[0], file.uri)).toBe('# fud-disable FUD1380: x\n# fud-disable-next-line FUD1380: \nrest\n');
  });
});
