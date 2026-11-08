/**
 * SDD-75 criteria 1–6 — the snippets of a `.fudapi`, by context, in place of the bare keyword.
 */

import { describe, expect, it } from 'vitest';
import { DECLARATION_KEYWORDS, validateApi } from '@fudic/api';
import { CompletionItemKind, InsertTextFormat, InsertTextMode, type CompletionItem } from 'vscode-languageserver-protocol';
import { apiCompletions } from '../../src/fudapi/completion.js';
import { SNIPPETS } from '../../src/fudapi/snippets.js';
import { FILES, SRC, apiDocument, cursor, world } from './_api.js';

function items(marked: string, files: Readonly<Record<string, string>> = {}): readonly CompletionItem[] {
  const { text, offset } = cursor(marked);
  const { host } = world({ files: { ...FILES, ...files } });
  return apiCompletions(apiDocument(host, text), offset)?.items ?? [];
}

const named = (found: readonly CompletionItem[], label: string): readonly CompletionItem[] => found.filter((i) => i.label === label);
const snippets = (found: readonly CompletionItem[]): readonly string[] =>
  found.filter((i) => i.kind === CompletionItemKind.Snippet).map((i) => i.label);

/** A snippet as the client leaves it when every tabstop keeps its default. */
const expand = (body: string): string =>
  body.replace(/\$\{\d+:([^}]*)\}/gu, '$1').replace(/\$\{\d+\|([^,|]*)[^}]*\}/gu, '$1').replace(/\$\{?\d+\}?/gu, '');

describe('snippets (SDD-75)', () => {
  it('criterion 1: at the root, `post` is one entry, a snippet with its text', () => {
    const post = named(items('|'), 'post');
    expect(post).toHaveLength(1);
    expect(post[0]).toEqual({
      label: 'post',
      kind: CompletionItemKind.Snippet,
      detail: 'POST function',
      insertText: 'post ${1:name}\n  ${2:arg}  ${3:str}$0',
      insertTextFormat: InsertTextFormat.Snippet,
      insertTextMode: InsertTextMode.asIs,
    });
    // The declarations with no snippet stay as keywords.
    expect(named(items('|'), 'paths')[0]!.kind).toBe(CompletionItemKind.Keyword);
    expect(snippets(items('|'))).toEqual([...DECLARATION_KEYWORDS.filter((k) => k in SNIPPETS.root), 'rule remote']);
    expect(snippets(items('|'))).toHaveLength(Object.keys(SNIPPETS.root).length + 1);
  });

  it('criterion 2: no root snippet under a field; in a function, its own `form`', () => {
    expect(named(items('form f\n  a  str\n    |'), 'post')).toEqual([]);
    const form = named(items('post f\n  |'), 'form');
    expect(form.map((i) => i.insertText)).toEqual(['form ${1}']);
  });

  it('criterion 3: the rules of a field by its type, the project\'s with their parameters as tabstops', () => {
    const min = 'rule min\n  on field u8 f64\n  runs both\n  n  f64\n  fails min n\n';
    const own = 'rule starts\n  on field str\n  runs both\n  prefix  str\n  regex  pattern\n  fails starts prefix\n';
    const files = { [`${SRC}/rules/r.fudapi`]: min + own };
    expect(named(items('form f\n  a  u8\n    |', files), 'min')[0]!.insertText).toBe('min ${1:n}  "${2:text}"');
    expect(named(items('form f\n  a  bool\n    |', files), 'min')).toEqual([]);
    const str = items('form f\n  a  str\n    |', files);
    expect(named(str, 'starts')[0]!.insertText).toBe('starts ${1:prefix} ${2}  "${3:text}"');
    expect(named(str, 'starts')[0]!.detail).toBe('prefix str regex pattern');
    expect(named(str, 'required')[0]!.insertText).toBe('required  "${1:text}"');
  });

  it('criterion 4: accepted on a line indented by 2, its inner lines are at 4', () => {
    expect(named(items('form f\n  |'), 'summary')[0]!.insertText).toBe('summary\n    ${1}');
    // A blank line of the body stays blank.
    expect(named(items('|'), 'form')[0]!.insertText).toContain('${1:name}\n\n  ${2:field}');
  });

  it('criterion 5: inside quotes, no snippet', () => {
    expect(snippets(apiCompletions(apiDocument(world().host, 'post f\n  fails x 409 "'), 'post f\n  fails x 409 "'.length)?.items ?? [])).toEqual([]);
    expect(snippets(items('form f\n  a  str\n    required  "|'))).toEqual([]);
  });

  it('criterion 6: in a function, `catches` and `fails` as snippets; in `load`, neither', () => {
    const found = snippets(items('post f\n  |'));
    expect(found).toContain('catches');
    expect(found).toContain('fails');
    expect(named(items('post f\n  |'), 'fails')[0]!.insertText).toBe('fails ${1:code} ${2:409} "${3:text}"');
    expect(items('load\n  |').map((i) => i.label)).not.toContain('fails');
    expect(items('load\n  |').map((i) => i.label)).not.toContain('catches');
  });

  it('in a group, the snippets of a form; elsewhere, bare keywords', () => {
    expect(snippets(items('form f\n  g  group\n    |'))).toEqual(['validate-on', 'summary']);
    expect(snippets(items('chain\n  |'))).toEqual([]);
  });

  it.each(Object.entries(SNIPPETS.root))('`%s` with its defaults is a valid declaration', (_, snippet) => {
    const text = `${expand(snippet.body)}\n`;
    const { host } = world({ files: { ...FILES, [`${SRC}/middlewares/log.fudapi`]: 'middleware log\n  server\n' } });
    const doc = apiDocument(host, text, `${SRC}/routes/usuarios.fudapi`);
    expect([...doc.parseDiagnostics, ...validateApi(doc.source, doc.index, doc.context)].map((d) => d.message)).toEqual([]);
  });
});
