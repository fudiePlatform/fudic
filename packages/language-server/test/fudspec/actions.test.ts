/**
 * SDD-53 §4.5, criteria 17 and 18 — the light bulb of a `.fudspec`: one input per row, the
 * action on its diagnostic, its edit leaving the file without it, and nothing on sound code.
 */

import { describe, expect, it } from 'vitest';
import type { CodeAction, TextEdit } from '@volar/language-service';
import {
  fixtureEntry,
  fixtureModule,
  formatSpec,
  parseSpec,
  readFixtures,
  termModule,
  validateSpec,
  type PropField,
} from '@fudic/spec';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { specCodeActions, type PropsOf } from '../../src/fudspec/actions.js';
import { FILES, ROOT, SPEC_PATH, WS_TERMS, specDocument, termSource, world, type WorldOptions } from './_spec.js';

const FIXTURE_PATH = `${ROOT}/components/fud-card.fixture.ts`;
const SPEC_URI = URI.file(SPEC_PATH).toString();

const TITLE: readonly PropField[] = [
  { name: 'title', required: true, shape: { kind: 'string' } },
  { name: 'subtitle', required: false, shape: { kind: 'string' } },
];

interface Run {
  readonly text: string;
  readonly world?: WorldOptions;
  readonly path?: string;
  readonly propsOf?: PropsOf;
  /** The requested stretch; the whole file by default. */
  readonly range?: readonly [number, number];
}

function actions(run: Run): CodeAction[] {
  const w = world(run.world);
  const path = run.path ?? SPEC_PATH;
  const spec = specDocument(run.text, path);
  const document = TextDocument.create(URI.file(path).toString(), 'fudspec', 1, run.text);
  const [start, end] = run.range ?? [0, run.text.length];
  return specCodeActions({ spec, host: w.host, document, start, end, propsOf: run.propsOf ?? (() => undefined) });
}

/** The parser's and the validator's codes for a text, in a world. */
function codes(text: string, options: WorldOptions = {}, path = SPEC_PATH): readonly string[] {
  const { host } = world(options);
  const parsed = parseSpec(text);
  return [...parsed.diagnostics, ...validateSpec(parsed.value, host.context(path))].map((d) => d.code);
}

/** The `.fudspec` after an action's own edits. */
function applied(text: string, action: CodeAction | undefined): string {
  const edits = action?.edit?.changes?.[SPEC_URI] as TextEdit[] | undefined;
  expect(edits).toBeDefined();
  return TextDocument.applyEdits(TextDocument.create(SPEC_URI, 'fudspec', 1, text), edits ?? []);
}

/** The file an action creates: its uri and its text. */
function createdBy(action: CodeAction | undefined): { readonly path: string; readonly text: string } {
  const [create, write] = (action?.edit?.documentChanges ?? []) as [
    { kind: string; uri: string; options: unknown },
    { textDocument: { uri: string }; edits: TextEdit[] },
  ];
  expect(create).toMatchObject({ kind: 'create', options: { ignoreIfExists: true } });
  expect(write.textDocument.uri).toBe(create.uri);
  return { path: URI.parse(create.uri).path, text: write.edits[0]?.newText ?? '' };
}

const titles = (found: readonly CodeAction[]) => found.map((a) => a.title);

const SOUND = 'component fud-card\n\ncriterion a\n  given\n    props vacio\n  then\n    min-height fud-card 44\n';

describe('no diagnostic, no action (criterion 17)', () => {
  it('offers nothing on a sound file', () => {
    expect(codes(SOUND)).toEqual([]);
    expect(actions({ text: SOUND })).toEqual([]);
  });

  it('offers nothing for a diagnostic outside the requested stretch, or one without a repair', () => {
    const text = 'component fud-button\n\ncriterion a\n  then\n    visibl fud-button\n';
    expect(actions({ text, range: [0, 5] })).toEqual([]);
    // FUD0929: a block that is not one has no repair.
    expect(codes('component fud-button\n\ncriterion a\n  thn\n')).toContain('FUD0929');
    expect(actions({ text: 'component fud-button\n\ncriterion a\n  thn\n' })).toEqual([]);
  });
});

describe('FUD0940 — the term does not exist', () => {
  const text = 'component fud-button\n\ncriterion a\n  then\n    visibl fud-button\n';

  it('changes it to the closest term of the block', () => {
    const found = actions({ text });
    expect(titles(found)).toEqual(["Change to 'visible'", 'Create then/visibl.js']);
    expect(codes(applied(text, found[0]))).toEqual([]);
  });

  it('creates the module with one string parameter per argument, which then resolves the line', () => {
    const created = createdBy(actions({ text })[1]);
    expect(created).toEqual({
      path: `${WS_TERMS}/then/visibl.js`,
      text: termModule('then', 'visibl', [{ name: 'arg1', type: 'string' }]),
    });
    expect(codes(text, { files: { ...FILES, [created.path]: created.text } })).toEqual([]);
  });

  it('only creates when nothing is close, and only changes when there is no project folder', () => {
    expect(titles(actions({ text: text.replace('visibl', 'xyzzy') }))).toEqual(['Create then/xyzzy.js']);
    const outside = actions({ text, path: '/elsewhere/fud-button.fudspec' });
    expect(titles(outside)).toEqual(["Change to 'visible'"]);
  });
});

describe('FUD0949 — the component does not exist', () => {
  it('changes it to the closest tag of the workspace', () => {
    const text = 'component fud-crad\n';
    const found = actions({ text });
    expect(titles(found)).toEqual(["Change to 'fud-card'"]);
    expect(applied(text, found[0])).toBe('component fud-card\n');
    expect(codes(applied(text, found[0]))).toEqual([]);
  });

  it('offers nothing when no tag is close', () => {
    expect(codes('component zzz-qqq\n')).toEqual(['FUD0949']);
    expect(actions({ text: 'component zzz-qqq\n' })).toEqual([]);
  });
});

describe('FUD0922 — no component line', () => {
  const text = 'criterion a\n  then\n    visible fud-card\n';

  it('adds the component the file is named after', () => {
    const found = actions({ text });
    expect(titles(found)).toEqual(["Add 'component fud-card'"]);
    const fixed = applied(text, found[0]);
    expect(fixed).toBe(`component fud-card\n\n${text}`);
    expect(codes(fixed)).not.toContain('FUD0922');
  });

  it('offers nothing when no component has that name', () => {
    const other = `${ROOT}/components/other.fudspec`;
    expect(codes(text, {}, other)).toContain('FUD0922');
    expect(actions({ text, path: other })).toEqual([]);
  });
});

describe('FUD0953 — no fixture file (criteria 17 and 18)', () => {
  const noFixture = { files: { ...FILES, [FIXTURE_PATH]: undefined } };
  const text = 'component fud-card\n\ncriterion a\n  given\n    props uno\n  then\n    visible fud-card\n\ncriterion b\n  given\n    props dos\n  then\n    visible fud-card\n\ncriterion c\n  given\n    props uno\n  then\n    visible fud-card\n';

  it('creates the fixture with every key the file names, in order, filled by type', () => {
    expect(codes(text, noFixture)).toContain('FUD0953');
    const found = actions({ text, world: noFixture, propsOf: () => TITLE });
    // Three props lines, three FUD0953, one action.
    expect(titles(found)).toEqual(['Create fud-card.fixture.ts']);
    const created = createdBy(found[0]);
    expect(created).toEqual({ path: FIXTURE_PATH, text: fixtureModule('fud-card', ['uno', 'dos'], TITLE) });
    expect(created.text).toContain("  uno: { title: '' },\n");
    expect(codes(text, { files: { ...FILES, [FIXTURE_PATH]: created.text } })).toEqual([]);
  });

  it('without a TypeScript program, creates it with the keys and no props (criterion 18)', () => {
    const created = createdBy(actions({ text, world: noFixture })[0]);
    expect(created.text).toBe(fixtureModule('fud-card', ['uno', 'dos'], []));
    expect(created.text).toContain('  uno: {},\n  dos: {},\n');
  });

  it('asks the program about the component’s own .fud', () => {
    const asked: string[] = [];
    actions({ text, world: noFixture, propsOf: (path) => (asked.push(path), undefined) });
    expect(asked[0]).toBe(`${ROOT}/components/fud-card.fud`);
  });

  it('offers nothing when the component does not exist', () => {
    const missing = 'component fud-nope\n\ncriterion a\n  given\n    props uno\n';
    expect(codes(missing)).toContain('FUD0953');
    expect(titles(actions({ text: missing }))).not.toContain('Create fud-nope.fixture.ts');
  });
});

describe('FUD0950 — the fixture does not exist', () => {
  const text = 'component fud-card\n\ncriterion a\n  given\n    props vacia\n  then\n    visible fud-card\n';

  it('changes it to the closest key, and adds the key to the fixture file', () => {
    const found = actions({ text, propsOf: () => TITLE });
    expect(titles(found)).toEqual(["Change to 'vacio'", "Add 'vacia' to fud-card.fixture.ts"]);
    expect(codes(applied(text, found[0]))).toEqual([]);

    const source = FILES[FIXTURE_PATH] as string;
    const change = found[1]?.edit?.documentChanges?.[0] as { textDocument: { uri: string }; edits: TextEdit[] };
    expect(URI.parse(change.textDocument.uri).path).toBe(FIXTURE_PATH);
    const grown = TextDocument.applyEdits(TextDocument.create(change.textDocument.uri, 'typescript', 1, source), change.edits);
    expect(grown).toContain(`  ${fixtureEntry('vacia', TITLE)},\n}`);
    expect(readFixtures(grown, FIXTURE_PATH).names.map((n) => n.text)).toEqual(['titulo-largo', 'vacio', 'vacia']);
    expect(codes(text, { files: { ...FILES, [FIXTURE_PATH]: grown } })).toEqual([]);
  });

  it('writes a key that needs quotes quoted, and adds nothing to a file without a default object', () => {
    const spaced = "export default { 'titulo largo': {} };\n";
    const found = actions({ text: text.replace('vacia', '"titulo larg"'), world: { files: { ...FILES, [FIXTURE_PATH]: spaced } } });
    expect(titles(found)).toEqual(["Change to 'titulo largo'", "Add 'titulo larg' to fud-card.fixture.ts"]);
    expect(applied(text.replace('vacia', '"titulo larg"'), found[0])).toContain('props "titulo largo"\n');

    const quoted = "export default { 'say \"hi\\\\': {} };\n";
    const escaped = text.replace('vacia', '"say \\"hi"');
    const near = actions({ text: escaped, world: { files: { ...FILES, [FIXTURE_PATH]: quoted } } });
    expect(applied(escaped, near[0])).toContain('props "say \\"hi\\\\"\n');

    const bare = { files:{ ...FILES, [FIXTURE_PATH]: 'export const x = 1;\n' } };
    expect(codes(text, bare)).toContain('FUD0950');
    expect(titles(actions({ text: text.replace('vacia', 'zzzzzz'), world: bare }))).toEqual([]);
  });
});

describe('FUD0951 — the criterion lacks props', () => {
  it('adds props with the first key to the given block', () => {
    const text = 'component fud-card\n\ncriterion a\n  given\n    route /x\n  then\n    visible fud-card\n';
    const found = actions({ text });
    expect(titles(found)).toEqual(["Add 'props titulo-largo'"]);
    const fixed = applied(text, found[0]);
    expect(fixed).toContain('  given\n    props titulo-largo\n    route /x\n');
    expect(codes(fixed)).toEqual([]);
  });

  it('adds a given block when there is none, and names base without a fixture file', () => {
    const text = 'component fud-card\n\ncriterion a\n  then\n    visible fud-card\n';
    const found = actions({ text, world: { files: { ...FILES, [FIXTURE_PATH]: undefined } } });
    expect(titles(found)).toEqual(["Add 'props base'"]);
    expect(applied(text, found[0])).toBe('component fud-card\n\ncriterion a\n  given\n    props base\n  then\n    visible fud-card\n');
  });

  it('places the block after the keyword of a criterion without a slug', () => {
    const text = 'component fud-card\n\ncriterion\n  then\n    visible fud-card\n';
    const found = actions({ text }).filter((a) => a.title.startsWith('Add'));
    expect(applied(text, found[0])).toContain('criterion\n  given\n    props titulo-largo\n  then\n');
  });
});

describe('FUD0947 — the number of arguments', () => {
  it('completes the missing ones with a marker per parameter', () => {
    const text = 'component fud-card\n\ncriterion a\n  given\n    props vacio\n  then\n    min-height\n';
    const found = actions({ text });
    expect(titles(found)).toEqual(['Complete the arguments']);
    const fixed = applied(text, found[0]);
    expect(fixed).toContain('    min-height <target> <px>\n');
    expect(codes(fixed)).not.toContain('FUD0947');
  });

  it('removes the extra ones, after the last parameter or after the name', () => {
    const text = 'component fud-card\n\ncriterion a\n  given\n    props vacio\n  then\n    visible fud-card extra "more"\n';
    const found = actions({ text });
    expect(titles(found)).toEqual(['Remove the extra arguments']);
    expect(applied(text, found[0])).toContain('    visible fud-card\n');
    expect(codes(applied(text, found[0]))).toEqual([]);

    const ready = { files: { ...FILES, [`${WS_TERMS}/then/ready.js`]: termSource('ready', 'then') } };
    const zero = text.replace('visible fud-card extra "more"', 'ready now');
    const removed = applied(zero, actions({ text: zero, world: ready })[0]);
    expect(removed).toContain('    ready\n');
    expect(codes(removed, ready)).toEqual([]);
  });

  it('offers nothing for a props line, which has no module', () => {
    const text = 'component fud-card\n\ncriterion a\n  given\n    props vacio otra\n';
    expect(codes(text)).toContain('FUD0947');
    expect(actions({ text })).toEqual([]);
  });
});

describe('FUD0921 — the indentation', () => {
  it('formats the whole document, once however many lines are wrong', () => {
    const text = 'component fud-card\n\ncriterion a\n   given\n\tprops vacio\n  then\n      min-height fud-card 44\n';
    expect(codes(text).filter((c) => c === 'FUD0921').length).toBeGreaterThan(1);
    const found = actions({ text });
    expect(titles(found)).toEqual(['Format the document']);
    const fixed = applied(text, found[0]);
    expect(fixed).toBe(formatSpec(text).text);
    expect(codes(fixed)).toEqual([]);
  });

  it('offers nothing when the file cannot be formatted', () => {
    const text = 'component fud-card\n\ncriterion a\n   given\n    props "vacio\n';
    expect(codes(text)).toEqual(expect.arrayContaining(['FUD0920', 'FUD0921']));
    expect(titles(actions({ text }))).not.toContain('Format the document');
  });
});
