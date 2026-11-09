/**
 * SDD-81 §3.1–§3.2, criteria 1–5: `file` in the `.fudapi` — where it goes and where it does not,
 * how the `.d.ts` and the module type it, the rules of a file and their sizes with a unit.
 *
 * The rules are `@fudic/forms`'s own `rules.fudapi`, read from the package, with `max-size` and
 * `accept` as §3.2 writes them: they land in that file with phase 5.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createApiIndex, emitDeclarations, emitModule, parseApi, validateApi, type ApiSource } from '../src/index.js';
import { FORMS_PATTERNS, HTTP_MIDDLEWARES, slice } from './helpers.js';
import { app, lib } from './project.js';

const FILE_RULES = [
  '',
  '# The file is no bigger than n bytes. An empty field is required\'s business.',
  'rule max-size',
  '  on field file file[]',
  '  runs both',
  '  n  f64',
  '  fails max-size n',
  '',
  "# The file's type is one the list accepts: the syntax of the HTML accept attribute.",
  'rule accept',
  '  on field file file[]',
  '  runs both',
  '  types  str',
  '  fails accept types',
  '',
].join('\n');

const RULES = readFileSync(new URL('../../forms/fudapi/rules.fudapi', import.meta.url), 'utf8');
const RULES_WITH_FILES = RULES.includes('rule max-size') ? RULES : `${RULES}${FILE_RULES}`;

const BUILT_INS: readonly ApiSource[] = [
  lib('@fudic/forms', 'rules', RULES_WITH_FILES),
  lib('@fudic/forms', 'patterns', FORMS_PATTERNS),
  lib('@fudic/http', 'middlewares', HTTP_MIDDLEWARES),
];

const lines = (...l: string[]): string => l.join('\n');

/** `text` as the app file `id`, validated in a project of the built-ins, `others` and itself. */
function checked(text: string, { id = 'components/x', others = [] as readonly ApiSource[], route = false } = {}) {
  const parsed = parseApi(text);
  expect(parsed.diagnostics.map((d) => d.message)).toEqual([]);
  const source: ApiSource = { id, path: `/app/src/${id}.fudapi`, file: parsed.value, origin: 'app' };
  const index = createApiIndex([...BUILT_INS, ...others, source]);
  const ctx = route ? { route: { params: [] } } : {};
  return { source, index, ctx, diagnostics: validateApi(source, index, ctx) };
}

/** The diagnostics as code and the text they cover. */
const found = (text: string, options?: Parameters<typeof checked>[1]) =>
  checked(text, options).diagnostics.map((d) => [d.code, slice(text, d.span)] as const);

describe('criterion 1: file, file? and file[] where they go', () => {
  const TEXT = lines(
    'put save',
    '  avatar  file',
    '  cover   file?',
    '  docs    file[]',
    '  extra   Doc',
    '',
    'patch touch',
    '  doc  Doc',
    '',
    'delete drop',
    '  proof  file',
    '',
    'post send',
    '  form up',
    '',
    'get grab',
    '  id  i32',
    '  -> file',
    '',
    'type Doc',
    '  name  str',
    '  att   file?',
    '  deep  Inner[]',
    '',
    'type Inner',
    '  blob  file',
    '',
    'form up',
    '  avatar  file',
    '  maybe   file?',
    '    required',
    '  docs    file[]',
    '    required',
    '    max-length 3',
    '',
  );

  it('read in a body argument of every verb that has a body, in a form, in a type at any depth, and after -> of a get', () => {
    expect(found(TEXT)).toEqual([]);
  });

  it('the .d.ts types them as §3.1: File, an optional File, readonly File[]; in a form, File | null and readonly File[]', () => {
    const { source, index, ctx } = checked(TEXT);
    const dts = emitDeclarations(source, index, ctx);
    expect(dts).toContain('{ readonly avatar: File; readonly cover?: File; readonly docs: readonly File[]; readonly extra: Doc }');
    expect(dts).toContain('export interface Doc { readonly name: string; readonly att?: File; readonly deep: readonly Inner[] }');
    expect(dts).toContain('export interface Inner { readonly blob: File }');
    expect(dts).toContain("import type { FileField, FileListField, Form, Validated } from '@fudic/forms/contract';");
    expect(dts).toContain('export const up: Form<{ avatar: FileField; maybe: FileField; docs: FileListField }>;');
    // `required` takes the null out of the validated value, as for any other field (SDD-60).
    expect(dts).toContain('export type UpValue = { readonly avatar: File | null; readonly maybe: File; readonly docs: readonly File[] };');
    expect(dts).toContain('export type GrabHandler = (ctx: GrabCtx) => File | Promise<File>;');
  });

  it('the module: descriptor "file", the controls file(null) and files([]), and files: true where a call may carry one', () => {
    const { source, index, ctx } = checked(TEXT);
    for (const side of ['browser', 'server'] as const) {
      const mod = emitModule(source, index, ctx, side);
      expect(mod).toContain('args: { avatar: "file", cover: { opt: "file" }, docs: { list: "file" }, extra: $Doc }');
      expect(mod).toContain('export const $Doc = { fields: () => ({ name: "str", att: { opt: "file" }, deep: { list: $Inner } }) };');
      expect(mod).toContain("import { file, files, formOf } from '@fudic/forms/contract';");
      expect(mod).toContain('avatar: file(null),');
      expect(mod).toContain('docs: files([], [required.use(), maxLength.use({ n: 3 })]),');
      expect(mod).toMatch(/export const save = \w+\(\{[^\n]*files: true/u);
      // Through a type, at any depth.
      expect(mod).toMatch(/export const touch = \w+\(\{[^\n]*files: true/u);
      expect(mod).toMatch(/export const drop = \w+\(\{[^\n]*files: true/u);
      // Through a form.
      expect(mod).toMatch(/export const send = \w+\(\{[^\n]*files: true/u);
      // A get answers a file; it carries none.
      expect(mod).toMatch(/export const grab = \w+\(\{[^\n]*returns: "file"/u);
      expect(mod).not.toMatch(/export const grab = [^\n]*files: true/u);
    }
  });

  it('a function with no file anywhere is not marked', () => {
    const { source, index, ctx } = checked(lines('put save', '  name  str', '  doc  Plain', '', 'type Plain', '  a  str', ''));
    expect(emitModule(source, index, ctx, 'browser')).not.toContain('files: true');
  });

  it('a form with a file in a group marks its call too', () => {
    const { source, index, ctx } = checked(lines('form g', '  data  group', '    photo  file', '', 'post send', '  form g', ''));
    expect(emitModule(source, index, ctx, 'browser')).toMatch(/export const send = [^\n]*files: true/u);
  });

  it('the signature names the control file: a page built before the field changed is told', () => {
    const one = checked(lines('form f', '  a  file', '', 'post send', '  form f', ''));
    const other = checked(lines('form f', '  a  str', '', 'post send', '  form f', ''));
    const sig = (c: ReturnType<typeof checked>): string => /export const send = [^\n]*sig: "([0-9a-f]+)"/u.exec(emitModule(c.source, c.index, c.ctx, 'browser'))![1]!;
    expect(sig(one)).not.toBe(sig(other));
  });

  it('a file as a map key is FUD1089, as any other key that is not one', () => {
    expect(found(lines('put save', '  byFile  map file str', '')).map(([code]) => code)).toEqual(['FUD1089']);
  });

  it('a file as a map value is a file all the same: FUD1480 in a get', () => {
    expect(found(lines('get g', '  m  map str file', ''))).toEqual([['FUD1480', 'file']]);
  });
});

describe('criterion 2: where a file cannot go', () => {
  it('a get argument, a route parameter and a query parameter: FUD1480 on the file, and no FUD1101 besides', () => {
    expect(found(lines('get g', '  f  file', ''))).toEqual([['FUD1480', 'file']]);
    expect(found(lines('get g', '  fs  file[]', ''))).toEqual([['FUD1480', 'file']]);
    expect(found(lines('put p /:f', '  f  file', ''))).toEqual([['FUD1480', 'file']]);
    expect(found(lines('put p', '  query q file?', ''))).toEqual([['FUD1480', 'file']]);
    const messages = checked(lines('get g', '  f  file', '', 'put p /:f', '  f  file', '', 'put q', '  query x file', '')).diagnostics.map((d) => d.message);
    expect(messages).toEqual([
      expect.stringContaining('`file` is not allowed as an argument of a get'),
      expect.stringContaining('`file` is not allowed as a route parameter'),
      expect.stringContaining('`file` is not allowed as a query parameter'),
    ]);
  });

  it('a type that brings a file into a get: FUD1480 on the use, related to the file', () => {
    const text = lines('get g', '  d  Doc', '', 'type Doc', '  n    str', '  att  file', '');
    const [d] = checked(text).diagnostics;
    expect(d!.code).toBe('FUD1480');
    expect(slice(text, d!.span)).toBe('Doc');
    expect(d!.related).toEqual([{ span: expect.anything(), message: 'the `file` it carries' }]);
    expect(slice(text, d!.related![0]!.span)).toBe('file');
  });

  it('load: FUD1481 on the file of its field', () => {
    expect(found(lines('load', '  photo  file', ''), { id: 'routes/a', route: true })).toEqual([['FUD1481', 'file']]);
  });

  it('a type used by load: FUD1481 on the use, related to the field, in the file that has it', () => {
    const shared = app('types/doc', lines('type Doc', '  att  file?', ''));
    const text = lines('load', '  doc  Doc[]', '');
    const [d] = checked(text, { id: 'routes/a', route: true, others: [shared] }).diagnostics;
    expect(d!.code).toBe('FUD1481');
    expect(slice(text, d!.span)).toBe('Doc[]');
    expect(d!.related).toEqual([{ span: expect.anything(), message: 'the `file` it carries', file: '/app/src/types/doc.fudapi' }]);
    expect(d!.message).toContain('`load` reaches a `file`');
  });

  it('a type that reaches itself is followed once, and one without a file says nothing', () => {
    const text = lines('load', '  t  Tree', '', 'type Tree', '  name  str', '  kids  Tree[]', '');
    expect(found(text, { id: 'routes/a', route: true })).toEqual([]);
  });

  it('a name that is no type of the project is not followed', () => {
    expect(found(lines('load', '  e  Kind', '', 'enum Kind', '  a', '  b', ''), { id: 'routes/a', route: true })).toEqual([]);
  });
});

describe('criterion 3: a file has no initial value, and no rule takes one', () => {
  it('avatar file = "x": FUD1482 on the value, for file, file? and file[]', () => {
    expect(found(lines('form f', '  avatar  file = "x"', ''))).toEqual([['FUD1482', '"x"']]);
    expect(found(lines('form f', '  avatar  file? = "x"', ''))).toEqual([['FUD1482', '"x"']]);
    expect(found(lines('form f', '  docs  file[] = []', ''))).toEqual([['FUD1482', '[]']]);
  });

  it('a rule with a file parameter: FUD1483 on it; through a type, on the use', () => {
    const own = lines('rule r', '  on field str', '  runs both', '  f  file', '  fails r', '');
    expect(found(own)).toEqual([['FUD1483', 'file']]);
    const through = lines('rule r', '  on field str', '  runs both', '  d  Doc', '  fails r', '', 'type Doc', '  f  file', '');
    expect(found(through)).toEqual([['FUD1483', 'Doc']]);
    expect(checked(own).diagnostics[0]!.message).toContain('a rule cannot take a file');
  });
});

describe('criterion 4: sizes with a unit, and a text argument', () => {
  const field = (...rules: string[]): string => lines('form f', '  photo  file', ...rules.map((r) => `    ${r}`), '', 'post send', '  form f', '');
  const moduleOf = (text: string): string => {
    const c = checked(text);
    expect(c.diagnostics).toEqual([]);
    return emitModule(c.source, c.index, c.ctx, 'browser');
  };

  it('max-size 2mb keeps 2097152 bytes; 500kb, 1.5gb and 2MB, base 1024 and whole bytes', () => {
    expect(moduleOf(field('max-size 2mb'))).toContain('maxSize.use({ n: 2097152 })');
    expect(moduleOf(field('max-size 500kb'))).toContain('maxSize.use({ n: 512000 })');
    expect(moduleOf(field('max-size 1.5gb'))).toContain('maxSize.use({ n: 1610612736 })');
    expect(moduleOf(field('max-size 0.3kb'))).toContain('maxSize.use({ n: 307 })');
    expect(moduleOf(field('max-size 2MB'))).toContain('maxSize.use({ n: 2097152 })');
    expect(moduleOf(field('max-size 1000'))).toContain('maxSize.use({ n: 1000 })');
  });

  it('max-size 2mo, 3tb: FUD1487 on the number, instead of an argument of the wrong type', () => {
    expect(found(field('max-size 2mo'))).toEqual([['FUD1487', '2mo']]);
    expect(found(field('max-size 3tb'))).toEqual([['FUD1487', '3tb']]);
    expect(checked(field('max-size 2mo')).diagnostics[0]!.message).toContain('`2mo` is a size with an unknown unit');
  });

  it('a word that is not size-like under a number is still the wrong type', () => {
    expect(found(field('max-size big')).map(([code]) => code)).toEqual(['FUD1084']);
  });

  it('accept "image/*" is read as the argument, not as the text', () => {
    const mod = moduleOf(field('accept "image/*"'));
    expect(mod).toContain('accept.use({ types: "image/*" })');
    expect(mod).not.toContain('messages');
  });

  it('accept with its argument and a text: both, in order', () => {
    const mod = moduleOf(field('accept "image/png, .pdf"  "Solo PNG o PDF."'));
    expect(mod).toContain('accept.use({ types: "image/png, .pdf" })');
    expect(mod).toContain('"Solo PNG o PDF."');
  });

  it('a rule with no str parameter keeps a lone string as its text', () => {
    const mod = moduleOf(field('required  "Elige una foto."'));
    expect(mod).toContain('required.use()');
    expect(mod).toContain('"Elige una foto."');
  });

  it('accept with nothing: too few arguments', () => {
    expect(found(field('accept')).map(([code]) => code)).toEqual(['FUD1084']);
  });

  it('under a function argument: max-size and accept are argument rules, with their validators', () => {
    const c = checked(lines('put up', '  photo  file', '    max-size 2mb', '    accept "image/*"  "Solo imágenes."', ''));
    expect(c.diagnostics).toEqual([]);
    const mod = emitModule(c.source, c.index, c.ctx, 'browser');
    expect(mod).toContain('maxSize as $maxSize');
    expect(mod).toContain('accept as $accept');
    expect(mod).toContain('{ check: $maxSize(2097152), name: "max-size", args: [2097152] }');
    expect(mod).toContain('{ check: $accept("image/*"), name: "accept", args: ["image/*"], text: "Solo imágenes." }');
  });

  it('max-size 2mo under a function argument: FUD1487 too', () => {
    expect(found(lines('put up', '  photo  file', '    max-size 2mo', ''))).toEqual([['FUD1487', '2mo']]);
  });
});

describe('criterion 5: a rule of a file on another type', () => {
  it('max-size and accept on a str field: FUD1083, as any rule out of its type', () => {
    expect(found(lines('form f', '  name  str', '    max-size 2mb', '')).map(([code]) => code)).toEqual(['FUD1083']);
    expect(found(lines('form f', '  name  str', '    accept "image/*"', '')).map(([code]) => code)).toEqual(['FUD1083']);
  });

  it('min-length and max-length count files in a file[]; required takes any field', () => {
    expect(found(lines('form f', '  docs  file[]', '    required', '    min-length 1', '    max-length 3', '    max-size 1mb', ''))).toEqual([]);
  });
});
