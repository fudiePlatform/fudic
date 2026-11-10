/**
 * SDD-81 criterion 29 in the editor: a file input against its field — `FUD1484`, `FUD1485`,
 * `FUD1486` — is said in the editor as the build says it, and each has its repair.
 *
 * The forms come from the `.fudapi` the component links: declared there, or in another file of
 * the project that a function of the link takes by name.
 */

import { describe, expect, it } from 'vitest';
import { span } from '@fudic/compiler';
import { FUD1484, FUD1486 } from '@fudic/diagnostics';
import { fudicDiagnostics } from '@fudic/typecheck';
import { DocumentCache } from '../src/document-cache.js';
import { addMultiple, fieldInputType, removeMultiple } from '../src/file-input-repairs.js';
import { repairsFor, type Repair } from '../src/repairs.js';
import { placedDiagnostics } from '../src/services/plugin.js';
import { WorkspaceIndex } from '../src/workspace-index.js';
import { memoryFs } from './_support.js';

const PATH = '/p/src/components/up-load.fud';

/** The form, in a file of its own that the component's contract only names. */
const FORMS: Readonly<Record<string, string>> = {
  '/p/package.json': '{}',
  '/p/src/components/up-load.fudapi': 'put save\n  form upForm\n',
  '/p/src/forms/up.fudapi': [
    'form upForm',
    '  avatar  file?',
    '    accept "image/png"',
    '  docs  file[]',
    '  name  str',
    '  agree  bool',
    '  age  u8',
    '  born  date',
    '  role  Role',
    '',
    'enum Role',
    '  a',
    '  b',
    '',
  ].join('\n'),
  // Not a contract, and a folder that is never walked.
  '/p/src/forms/notes.txt': 'x',
  '/p/src/node_modules/x/y.fudapi': 'form upForm\n  avatar  str\n',
};

const component = (controls: string, link = '<link rel="server" href="./up-load.fudapi">'): string => `${link}
<up-load>
  <template shadowrootmode="open">
    <form control=@upForm form:=@save>
      ${controls}
    </form>
  </template>
</up-load>
`;

function setup(source: string, files: Readonly<Record<string, string>> = FORMS) {
  const index = new WorkspaceIndex(memoryFs({ ...files, [PATH]: source }));
  index.scan('/p');
  const cached = new DocumentCache(index).get(PATH, 1, source);
  const diagnostics = placedDiagnostics(PATH, fudicDiagnostics(cached, index));
  return { cached, index, diagnostics };
}

const codes = (source: string, files?: Readonly<Record<string, string>>): string[] =>
  setup(source, files).diagnostics.map((d) => d.code).filter((c) => c.startsWith('FUD148'));

function applied(source: string, repair: Repair): string {
  return [...repair.edits]
    .sort((a, b) => b.span.start - a.span.start)
    .reduce((text, e) => text.slice(0, e.span.start) + e.newText + text.slice(e.span.end), source);
}

/** The repairs of the one diagnostic of `code`, and the file after the first. */
function repaired(source: string, code: string): { readonly titles: readonly string[]; readonly after: string } {
  const s = setup(source);
  const found = s.diagnostics.filter((d) => d.code === code);
  expect(found, code).toHaveLength(1);
  const got = repairsFor({ cached: s.cached, index: s.index }, found[0]!);
  return { titles: got.map((r) => r.title), after: got.length === 0 ? source : applied(source, got[0]!) };
}

describe('the editor says what the build says (criterion 29)', () => {
  it('multiple on a file: FUD1484; none on a file[]: FUD1485; a file input on a str: FUD1486', () => {
    expect(codes(component('<input type="file" control=@upForm.avatar multiple>'))).toEqual(['FUD1484']);
    expect(codes(component('<input type="file" control=@upForm.docs>'))).toEqual(['FUD1485']);
    expect(codes(component('<input type="file" control=@upForm.name>'))).toEqual(['FUD1486']);
    expect(codes(component('<input control=@upForm.avatar>'))).toEqual(['FUD1486']);
  });

  it('nothing when the input says what the field says', () => {
    expect(codes(component('<input type="file" control=@upForm.avatar><input type="file" multiple control=@upForm.docs>'))).toEqual([]);
  });

  it('a form declared in the contract itself', () => {
    const files = { ...FORMS, '/p/src/components/up-load.fudapi': 'put save\n  form upForm\n\nform upForm\n  avatar  file\n' };
    expect(codes(component('<input type="file" control=@upForm.avatar multiple>'), files)).toEqual(['FUD1484']);
  });

  it('silent when the form is nowhere in the project, or the file links no contract', () => {
    const files = { ...FORMS, '/p/src/components/up-load.fudapi': 'put save\n  form elsewhere\n' };
    expect(codes(component('<input type="file" control=@elsewhere.avatar multiple>'), files)).toEqual([]);
    expect(codes(component('<input type="file" control=@upForm.avatar multiple>', ''))).toEqual([]);
  });

  it('silent on a filesystem that cannot list its folders', () => {
    const fs = memoryFs({ ...FORMS, [PATH]: component('<input type="file" control=@upForm.avatar multiple>') });
    const { readDirectory: _, ...blind } = fs;
    const index = new WorkspaceIndex(blind);
    index.scan('/p');
    const cached = new DocumentCache(index).get(PATH, 1, component('<input type="file" control=@upForm.avatar multiple>'));
    expect(fudicDiagnostics(cached, index).map((d) => d.code)).not.toContain('FUD1484');
  });
});

describe('the repairs (criterion 29)', () => {
  it('FUD1484: removes multiple, and the input is clean', () => {
    const { titles, after } = repaired(component('<input type="file" control=@upForm.avatar multiple>'), 'FUD1484');
    expect(titles).toEqual(['Remove multiple']);
    expect(after).toContain('<input type="file" control=@upForm.avatar>');
    expect(codes(after)).toEqual([]);
  });

  it('FUD1485: adds multiple', () => {
    const { titles, after } = repaired(component('<input type="file" control=@upForm.docs>'), 'FUD1485');
    expect(titles).toEqual(['Add multiple']);
    expect(after).toContain('<input type="file" control=@upForm.docs multiple>');
    expect(codes(after)).toEqual([]);
  });

  it.each([
    ['<input control=@upForm.avatar>', '<input type="file" control=@upForm.avatar>', 'Change to type="file"'],
    ['<input type="text" control=@upForm.avatar multiple>', '<input type="file" control=@upForm.avatar>', 'Change to type="file"'],
    ['<input type="text" control=@upForm.docs>', '<input type="file" control=@upForm.docs multiple>', 'Change to type="file"'],
    ['<input type="file" control=@upForm.name multiple>', '<input control=@upForm.name>', 'Make it a text input'],
    ['<input type="file" control=@upForm.agree>', '<input type="checkbox" control=@upForm.agree>', 'Change to type="checkbox"'],
    ['<input type="file" control=@upForm.age>', '<input type="number" control=@upForm.age>', 'Change to type="number"'],
    ['<input type="file" control=@upForm.born>', '<input type="date" control=@upForm.born>', 'Change to type="date"'],
  ])('FUD1486: %s becomes %s', (written, expected, title) => {
    const { titles, after } = repaired(component(written), 'FUD1486');
    expect(titles).toEqual([title]);
    expect(after).toContain(expected);
    expect(codes(after)).toEqual([]);
  });

  it('FUD1486 reads the forms past a link that gives none', () => {
    const files = { ...FORMS, '/p/src/components/other.fudapi': 'get g\n  -> str\n' };
    const links = '<link rel="server" href="./other.fudapi">\n<link rel="server" href="./up-load.fudapi">';
    const source = component('<input type="file" control=@upForm.agree>', links);
    const s = setup(source, files);
    const found = s.diagnostics.find((d) => d.code === 'FUD1486')!;
    expect(fieldInputType(s.cached, found).map((f) => f.title)).toEqual(['Change to type="checkbox"']);
  });

  it('FUD1486 has none for a type the input cannot be told, or an element that is not an input', () => {
    expect(repaired(component('<input type="file" control=@upForm.role>'), 'FUD1486').titles).toEqual([]);
    expect(repaired(component('<textarea control=@upForm.avatar></textarea>'), 'FUD1486').titles).toEqual([]);
  });

  it('declines a diagnostic it cannot place: no attribute there, or no control in it', () => {
    const source = component('<input type="file" control=@upForm.avatar multiple>');
    const { cached } = setup(source);
    const nowhere = span(0, 1);
    expect(removeMultiple(cached, FUD1484({ span: nowhere }))).toEqual([]);
    expect(fieldInputType(cached, FUD1486({ span: nowhere, field: 'str', fileInput: true }))).toEqual([]);
    const type = source.indexOf('type="file"');
    expect(fieldInputType(cached, FUD1486({ span: span(type, type + 11), field: 'str', fileInput: true }))).toEqual([]);
    expect(addMultiple(cached, FUD1484({ span: span(5, 5) }))[0]!.edits[0]!.span).toEqual(span(5, 5));
  });

  it('FUD1486 declines a node no form of the links has', () => {
    // The span of a control whose field is not there: what a stale diagnostic would point at.
    const source = component('<input type="file" control=@upForm.nope>');
    const { cached } = setup(source);
    const control = source.indexOf('control=@upForm.nope');
    const at = span(control, control + 'control=@upForm.nope'.length);
    expect(fieldInputType(cached, FUD1486({ span: at, field: 'str', fileInput: true }))).toEqual([]);
  });
});
