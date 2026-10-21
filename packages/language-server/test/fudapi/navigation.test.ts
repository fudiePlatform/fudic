/**
 * SDD-60 criterion 29 — hover and go-to-definition in a `.fudapi`, into the app and into a
 * library's `fudapi/`; and the semantic tokens, which ask the same question of every name.
 */

import { describe, expect, it } from 'vitest';
import type { MarkupContent } from 'vscode-languageserver-protocol';
import { URI } from 'vscode-uri';
import { apiDefinition, apiHover } from '../../src/fudapi/navigation.js';
import { apiSemanticTokens } from '../../src/fudapi/semantic-tokens.js';
import { FILES, FORMS, SRC, apiDocument, cursor, world } from './_api.js';

const AUTH_PATH = `${SRC}/middlewares/auth.fudapi`;

function at(marked: string, files: Readonly<Record<string, string | undefined>> = FILES) {
  const { text, offset } = cursor(marked);
  const { host } = world({ files });
  const doc = apiDocument(host, text);
  return { doc, offset, host, text };
}

const hoverText = (marked: string, files?: Readonly<Record<string, string | undefined>>): string | undefined => {
  const { doc, offset, host } = at(marked, files);
  return (apiHover(doc, offset, host)?.contents as MarkupContent | undefined)?.value;
};

describe('hover (criterion 29)', () => {
  it('over `use auth`: the declaration as written, with what it adds, its documentation and its file', () => {
    expect(hoverText('get f\n  use au|th')).toBe(
      [
        '```fudapi',
        'middleware auth\n  server\n  adds\n    user  str\n    roles  str[]\n  fails unauthorized 401',
        '```',
        '',
        'Who is calling.',
        '',
        '`middlewares/auth.fudapi`',
      ].join('\n'),
    );
  });

  it('covers the name it is over', () => {
    const { doc, offset, host, text } = at('get f\n  use csrf au|th');
    const range = apiHover(doc, offset, host)!.range!;
    expect(range).toEqual({ start: { line: 1, character: 11 }, end: { line: 1, character: 15 } });
    expect(text.split('\n')[1]!.slice(11, 15)).toBe('auth');
  });

  it('over a rule of a library: its origin is the package', () => {
    const value = hoverText('form f\n  a  str\n    requi|red')!;
    expect(value).toContain('rule required\n  on field *\n  runs both\n  fails required');
    expect(value).toContain('The value is not empty.');
    expect(value).toContain('`@fudic/forms · @fudic/forms/rules.fudapi`');
  });

  it('over a declaration of this file, its own text; no documentation, no paragraph', () => {
    expect(hoverText('type Pe|rsona\n  x  str\nget f\n  -> Persona')).toBe(
      '```fudapi\ntype Persona\n  x  str\n```\n\n`components/x.fudapi`',
    );
  });

  it('a name declared twice points at its own declaration', () => {
    const value = hoverText('type Person\n  other  str\n# Mine.\ntype Pers|on\n  mine  str')!;
    expect(value).toContain('mine  str');
    expect(value).toContain('Mine.');
  });

  it('over a type, a form, a pattern argument and a skipped middleware', () => {
    const forms = { ...FILES, [`${SRC}/forms/person.fudapi`]: 'form person\n  name  str' };
    expect(hoverText('get f\n  -> Pers|on')).toContain('type Person');
    expect(hoverText('get f\n  x  Ro|le')).toContain('enum Role');
    expect(hoverText('put f\n  form per|son', forms)).toContain('form person');
    expect(hoverText('form f\n  a  str\n    pattern em|ail')).toContain('pattern email');
    expect(hoverText('get f\n  skip cs|rf')).toContain('middleware csrf');
  });

  it('nothing over a name that resolves to nothing, a primitive or no name at all', () => {
    expect(hoverText('get f\n  use no|pe')).toBeUndefined();
    expect(hoverText('get f\n  -> s|tr')).toBeUndefined();
    expect(hoverText('ge|t f')).toBeUndefined();
  });

  it('a declaration whose file cannot be read shows an empty signature', () => {
    // Listed in the project, then gone from the disk: the index still holds its old parse.
    const { host } = world();
    const { text, offset } = cursor('get f\n  use au|th');
    const doc = apiDocument(host, text);
    const gone = { ...host, read: () => undefined } as unknown as typeof host;
    expect((apiHover(doc, offset, gone)!.contents as MarkupContent).value.startsWith('```fudapi\n\n```')).toBe(true);
    expect(apiDefinition(doc, offset, gone)![0]!.targetRange).toEqual({ start: { line: 0, character: 0 }, end: { line: 0, character: 0 } });
  });
});

describe('definition (criterion 29)', () => {
  it('`use auth` opens middlewares/auth.fudapi at its name', () => {
    const { doc, offset, host } = at('get f\n  use au|th');
    const [link] = apiDefinition(doc, offset, host)!;
    expect(link!.targetUri).toBe(URI.file(AUTH_PATH).toString());
    expect(link!.targetSelectionRange).toEqual({ start: { line: 1, character: 11 }, end: { line: 1, character: 15 } });
    expect(link!.targetRange).toEqual({ start: { line: 1, character: 0 }, end: { line: 6, character: 24 } });
    expect(link!.originSelectionRange).toEqual({ start: { line: 1, character: 6 }, end: { line: 1, character: 10 } });
  });

  it('`required` opens the rules of @fudic/forms', () => {
    const { doc, offset, host } = at('form f\n  a  str\n    requir|ed');
    const [link] = apiDefinition(doc, offset, host)!;
    expect(link!.targetUri).toBe(URI.file(`${FORMS}/rules.fudapi`).toString());
    expect(link!.targetSelectionRange.start).toEqual({ line: 1, character: 5 });
  });

  it('a name of this file stays in it', () => {
    const { doc, offset, host } = at('type A\n  x  str\nget f\n  -> |A');
    const [link] = apiDefinition(doc, offset, host)!;
    expect(link!.targetUri).toBe(URI.file(`${SRC}/components/x.fudapi`).toString());
    expect(link!.targetSelectionRange).toEqual({ start: { line: 0, character: 5 }, end: { line: 0, character: 6 } });
  });

  it('nothing for a name that resolves to nothing', () => {
    const { doc, offset, host } = at('get f\n  -> Gho|st');
    expect(apiDefinition(doc, offset, host)).toBeUndefined();
  });
});

describe('semantic tokens', () => {
  const tokens = (text: string) => {
    const { host } = world();
    return apiSemanticTokens(apiDocument(host, text)).map((t) => [text.slice(t.span.start, t.span.end), t.type, t.modifiers.join(',')]);
  };

  it('a keyword per declaration; names by class; unresolved, library and declaration marked', () => {
    const text = [
      'put save',
      '  use auth csrf nope',
      '  skip csrf',
      '  form userForm',
      '  p  Person',
      '  r  Role[]',
      '  m  map str Ghost',
      '  -> Person?',
      'form userForm',
      '  a  str',
      '    required',
      '    pattern email',
      '  g  group',
      '    b  str',
      '    summary',
      '      requird',
      '  summary',
      '    required',
      '    require x  a == "b"',
      'load',
      '  skip auth',
      '  d  Person',
      'chain',
      '  use auth',
      'paths',
      'enum E',
      '  x',
      'type T',
      '  e  E',
    ].join('\n');
    expect(tokens(text)).toEqual([
      ['put', 'keyword', ''],
      ['auth', 'function', ''],
      ['csrf', 'function', 'defaultLibrary'],
      ['nope', 'function', 'deprecated'],
      ['csrf', 'function', 'defaultLibrary'],
      ['userForm', 'variable', ''],
      ['Person', 'type', ''],
      ['Role', 'enum', ''],
      ['Ghost', 'type', 'deprecated'],
      ['Person', 'type', ''],
      ['form', 'keyword', ''],
      ['userForm', 'variable', 'declaration'],
      ['required', 'function', 'defaultLibrary'],
      ['pattern', 'function', 'defaultLibrary'],
      ['email', 'regexp', 'defaultLibrary'],
      ['requird', 'function', 'deprecated'],
      ['required', 'function', 'defaultLibrary'],
      ['load', 'keyword', ''],
      ['auth', 'function', ''],
      ['Person', 'type', ''],
      ['chain', 'keyword', ''],
      ['auth', 'function', ''],
      ['paths', 'keyword', ''],
      ['enum', 'keyword', ''],
      ['E', 'enum', 'declaration'],
      ['type', 'keyword', ''],
      ['T', 'type', 'declaration'],
      ['E', 'enum', ''],
    ]);
  });

  it('marks the declarations of an extensions file', () => {
    const text = [
      'rule r',
      '  on field Person str',
      '  p  pattern',
      '  q  Person',
      '  fails r',
      'middleware m',
      '  client',
      '  x  Person',
      '  adds',
      '    y  Role',
      'pattern p  a',
    ].join('\n');
    expect(tokens(text)).toEqual([
      ['rule', 'keyword', ''],
      ['r', 'function', 'declaration'],
      ['Person', 'type', ''],
      ['Person', 'type', ''],
      ['middleware', 'keyword', ''],
      ['m', 'function', 'declaration'],
      ['Person', 'type', ''],
      ['Role', 'enum', ''],
      ['pattern', 'keyword', ''],
      ['p', 'regexp', 'declaration'],
    ]);
  });

  it('a pattern argument that is no word, or of a rule that is not there, is no pattern', () => {
    const text = 'form f\n  a  str\n    pattern "x"\n    nope email\n    min-length 3';
    expect(tokens(text).map((t) => t[0])).toEqual(['form', 'f', 'pattern', 'nope', 'min-length']);
  });
});
