import { describe, expect, it } from 'vitest';
import { parseApi, type Decl } from '../src/index.js';
import { CANONICALS, FORMS_PATTERNS, FORMS_RULES, HTTP_MIDDLEWARES, USER_FORM, USUARIOS, view } from './helpers.js';

const docs = (source: string): readonly (readonly [string, string | undefined])[] =>
  parseApi(source).value.declarations.map((d: Decl) => [d.kind, d.doc] as const);

describe('the canonical files (criterion 1)', () => {
  for (const [name, source] of Object.entries(CANONICALS)) {
    it(`${name} has no diagnostics and the expected tree`, () => {
      const { value, diagnostics } = parseApi(source);
      expect(diagnostics).toEqual([]);
      expect(view(value, source)).toMatchSnapshot();
    });
  }

  it('reads the role of each file', () => {
    expect(parseApi(USUARIOS).value.role).toBe('contract');
    expect(parseApi(USER_FORM).value.role).toBe('contract');
    expect(parseApi(FORMS_RULES).value.role).toBe('extensions');
    expect(parseApi(HTTP_MIDDLEWARES).value.role).toBe('extensions');
  });

  it('a file of only types has no role', () => {
    expect(parseApi('type A\n  x  str\n').value).not.toHaveProperty('role');
  });

  it('keeps the documentation of each declaration', () => {
    expect(docs(USUARIOS)).toEqual([
      ['load', 'Per request: the list changes with every new person.'],
      ['fn', undefined],
      ['fn', undefined],
      ['type', undefined],
    ]);
    expect(docs(FORMS_RULES)).toEqual([
      ['rule', 'The value is not empty.'],
      ['rule', 'A number no smaller than `min`.'],
      ['rule', 'A number no bigger than `max`.'],
      ['rule', 'A text or a list with `min` items at least.'],
      ['rule', 'A text or a list with `max` items at most.'],
      ['rule', 'The whole text matches a pattern.'],
    ]);
    expect(docs(FORMS_PATTERNS)).toEqual([['pattern', 'The address `input type=email` accepts (WHATWG).']]);
    expect(docs(HTTP_MIDDLEWARES)).toEqual([
      ['middleware', 'A token on every unsafe call, checked on arrival.'],
      ['middleware', 'Sends the browser to a page by the status of a failed call.'],
    ]);
  });

  it('joins several `#` lines and drops one space after each `#`', () => {
    const { value } = parseApi('#  two spaces\n#no space\n# one\ntype A\n  x  str');
    expect(value.declarations[0]!.doc).toBe(' two spaces\nno space\none');
  });

  it('a blank line between the comment and the declaration cuts the documentation', () => {
    expect(parseApi('# loose\n\ntype A\n  x  str').value.declarations[0]).not.toHaveProperty('doc');
  });

  it('documents the lines inside a declaration too', () => {
    const source = [
      'put save',
      '  # Who changes it.',
      '  id  i32',
      '  # Taken.',
      '  fails taken 409 "Taken."',
      'type A',
      '  # The x.',
      '  x  str',
      'messages',
      '  # Global.',
      '  required  "Required."',
      'form f',
      '  # The name.',
      '  name  str',
      '    # Needed.',
      '    required',
      '  # The group.',
      '  g  group',
      '    y  str',
      '  summary',
      '    # Same.',
      '    require same  name == "x"',
      '    # When.',
      '    when name == "a"',
      '      require other  name != "b"',
    ].join('\n');
    const { value, diagnostics } = parseApi(source);
    expect(diagnostics).toEqual([]);
    const [fn, type, messages, form] = value.declarations as [
      Extract<Decl, { kind: 'fn' }>,
      Extract<Decl, { kind: 'type' }>,
      Extract<Decl, { kind: 'messages' }>,
      Extract<Decl, { kind: 'form' }>,
    ];
    expect(fn.args[0]!.doc).toBe('Who changes it.');
    expect(fn.fails[0]!.doc).toBe('Taken.');
    expect(type.fields[0]!.doc).toBe('The x.');
    expect(messages.entries[0]!.doc).toBe('Global.');
    const field = form.fields[0] as Extract<(typeof form.fields)[number], { kind: 'form-field' }>;
    expect(field.doc).toBe('The name.');
    expect(field.rules[0]!.doc).toBe('Needed.');
    expect(form.fields[1]!.doc).toBe('The group.');
    expect(form.summary!.items.map((i) => i.doc)).toEqual(['Same.', 'When.']);
  });

  it('the email pattern keeps its `#` and every character', () => {
    const { value } = parseApi(FORMS_PATTERNS);
    const decl = value.declarations[0] as Extract<Decl, { kind: 'pattern' }>;
    expect(decl.source.text).toBe(FORMS_PATTERNS.split('\n')[1]!.slice('pattern email  '.length));
    expect(decl.source.text).toContain('#');
  });
});
