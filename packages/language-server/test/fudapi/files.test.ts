/**
 * SDD-81 criterion 33 — files in the editor of a `.fudapi`: `file` among the types, with a hover
 * and never painted as an unknown name; `max-size` and `accept` only where a file is, with sizes
 * after `max-size` and media types inside the quotes of `accept`; the snippets of a file argument
 * and a file field; and the repairs of `FUD1480` (to `post`) and `FUD1482` (no initial value).
 *
 * The project publishes `@fudic/forms` as the package does: its rules, read from the package.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateApi } from '@fudic/api';
import type { LanguageServicePluginInstance } from '@volar/language-service';
import {
  CancellationToken,
  type CodeAction,
  type CompletionItem,
  type Hover,
  type MarkupContent,
  type TextEdit,
} from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { apiCompletions } from '../../src/fudapi/completion.js';
import { fileHover } from '../../src/fudapi/file-hover.js';
import { apiRepairs } from '../../src/fudapi/repairs.js';
import { apiSemanticTokens } from '../../src/fudapi/semantic-tokens.js';
import { createFudapiService } from '../../src/fudapi/service.js';
import { RequestStats } from '../../src/stats.js';
import { fakeServiceContext } from '../_lsp.js';
import { FILES, FORMS, SRC, apiDocument, cursor, world } from './_api.js';

const PROJECT: Readonly<Record<string, string | undefined>> = {
  ...FILES,
  [`${FORMS}/rules.fudapi`]: readFileSync(new URL('../../../forms/fudapi/rules.fudapi', import.meta.url), 'utf8'),
};

function at(marked: string) {
  const { text, offset } = cursor(marked);
  const { host } = world({ files: PROJECT });
  return { doc: apiDocument(host, text), offset, text };
}

const items = (marked: string): readonly CompletionItem[] => {
  const { doc, offset } = at(marked);
  return apiCompletions(doc, offset)?.items ?? [];
};
const labels = (marked: string): readonly string[] => items(marked).map((i) => i.label);

describe('`file` among the types (criterion 33)', () => {
  it('after the name of an argument, a field and `->`', () => {
    expect(labels('put save\n  doc  |')).toContain('file');
    expect(labels('form f\n  avatar  |')).toContain('file');
    expect(labels('get g\n  -> |')).toContain('file');
  });

  it('is never painted as a name of the project, nor as one that resolves to nothing', () => {
    const { doc } = at('put save\n  doc  file\n  docs  file[]\n  -> file?\n');
    expect(apiSemanticTokens(doc).filter((t) => t.type === 'type')).toEqual([]);
  });
});

describe('the rules of a file, only where a file is (criterion 33)', () => {
  it('under a field: `max-size` and `accept` on a file and a list of files, not on a text', () => {
    expect(labels('form f\n  avatar  file?\n    |')).toEqual(expect.arrayContaining(['required', 'max-size', 'accept']));
    expect(labels('form f\n  docs  file[]\n    |')).toEqual(expect.arrayContaining(['max-size', 'accept', 'max-length']));
    expect(labels('form f\n  name  str\n    |')).not.toContain('max-size');
    expect(labels('form f\n  name  str\n    |')).not.toContain('accept');
  });

  it('under an argument too: the rules of its type', () => {
    expect(labels('put save\n  doc  file\n    |')).toEqual(['required', 'max-size', 'accept']);
    expect(labels('put save\n  name  str\n    |')).not.toContain('max-size');
  });

  it('after `max-size`, sizes with their unit', () => {
    const found = items('form f\n  avatar  file?\n    max-size |');
    expect(found.map((i) => i.label)).toEqual(['500kb', '1mb', '2mb', '5mb', '10mb', '50mb', '100mb', '1gb']);
    expect(found[0]!.detail).toBe('bytes, base 1024');
    expect(labels('put save\n  doc  file\n    max-size |')).toContain('2mb');
  });

  it('inside the quotes of `accept`, media types that replace the whole entry', () => {
    const found = items('form f\n  avatar  file?\n    accept "image/|');
    expect(found.map((i) => i.label)).toEqual(expect.arrayContaining(['image/png', 'image/*', 'application/pdf', '.pdf']));
    const png = found.find((i) => i.label === 'image/png')!.textEdit as TextEdit;
    // From the opening quote: `image/` is replaced, not followed.
    expect(png).toEqual({ range: { start: { line: 2, character: 12 }, end: { line: 2, character: 18 } }, newText: 'image/png' });
  });

  it('after a comma, the next entry, without what is already written', () => {
    const found = items('form f\n  avatar  file?\n    accept "image/png, |');
    expect(found.map((i) => i.label)).not.toContain('image/png');
    expect((found.find((i) => i.label === 'image/jpeg')!.textEdit as TextEdit).range.start.character).toBe(23);
  });

  it('not in the text of the rule, the second string', () => {
    expect(labels('form f\n  avatar  file?\n    accept "image/*"  "Only |')).toEqual([]);
  });
});

/** A snippet as the client leaves it when every tabstop keeps its default, `\}` unescaped. */
const expand = (body: string): string =>
  body
    .replace(/\\\}/gu, '\u0000')
    .replace(/\$\{\d+:([^}]*)\}/gu, '$1')
    .replace(/\$\d+/gu, '')
    .replace(/\u0000/gu, '}');

describe('the snippets of a file (criterion 33)', () => {
  const snippet = (marked: string, label: string): CompletionItem | undefined => items(marked).find((i) => i.label === label);

  it('a file argument in a function with a body, never in a `get`', () => {
    expect(snippet('put save\n  |', 'file argument')!.detail).toBe('An argument that is a file');
    expect(snippet('get g\n  |', 'file argument')).toBeUndefined();
  });

  it('a file field in a form and in a group', () => {
    expect(snippet('form f\n  |', 'file field')!.detail).toBe('A field that is a file');
    expect(snippet('form f\n  g  group\n    |', 'file field')).toBeDefined();
  });

  it.each([
    ['put save\n  |', 'file argument', 'put save\n  '],
    ['form f\n  |', 'file field', 'form f\n  '],
  ])('%s: with its defaults it is valid', (marked, label, head) => {
    const body = expand(snippet(marked, label)!.insertText!);
    const { host } = world({ files: PROJECT });
    const doc = apiDocument(host, `${head}${body}\n`);
    expect([...doc.parseDiagnostics, ...validateApi(doc.source, doc.index, doc.context)].map((d) => d.message)).toEqual([]);
  });
});

describe('the hover over `file` (criterion 33)', () => {
  const hoverOf = (marked: string): Hover | undefined => {
    const { doc, offset } = at(marked);
    return fileHover(doc, offset);
  };

  it('says what a file becomes and where it travels', () => {
    const hover = hoverOf('put save\n  doc  fi|le\n')!;
    expect((hover.contents as MarkupContent).value).toContain('`File | null` in a form');
    expect(hover.range).toEqual({ start: { line: 1, character: 7 }, end: { line: 1, character: 11 } });
    expect(hoverOf('form f\n  docs  fi|le[]\n')).toBeDefined();
    expect(hoverOf('get g\n  -> file|?\n')).toBeDefined();
  });

  it('nothing over another type', () => {
    expect(hoverOf('put save\n  doc  s|tr\n')).toBeUndefined();
  });
});

describe('the repairs (criterion 33)', () => {
  const URI_OF = URI.file(`${SRC}/components/x.fudapi`).toString();

  function repaired(text: string): { readonly titles: readonly string[]; readonly after: string } {
    const { host, generated } = world({ files: PROJECT });
    const doc = apiDocument(host, text);
    const found = generated.check(doc.path, doc.text, doc);
    const actions = apiRepairs(doc, URI_OF, found, 0, text.length);
    const document = TextDocument.create(URI_OF, 'fudapi', 1, text);
    const first = actions[0]?.edit?.changes?.[URI_OF] ?? [];
    return { titles: actions.map((a) => a.title), after: TextDocument.applyEdits(document, first) };
  }

  it('FUD1480 in an argument of a get: make it a post', () => {
    const { titles, after } = repaired('get g\n  doc  file\n');
    expect(titles).toEqual(['Make it a post']);
    expect(after).toBe('post g\n  doc  file\n');
  });

  it('FUD1480 in a route or a query parameter: none, they are in the URL whatever the verb', () => {
    expect(repaired('get g\n  query q  file\n').titles).toEqual([]);
    expect(repaired('post g\n  query q  file\n').titles).toEqual([]);
  });

  it('FUD1482: the initial value goes, with its `=`', () => {
    const { titles, after } = repaired('form f\n  avatar  file? = "x"\n');
    expect(titles).toEqual(['Remove the initial value']);
    expect(after).toBe('form f\n  avatar  file?\n');
  });

  it('only for the diagnostics in the range asked', () => {
    const { host, generated } = world({ files: PROJECT });
    const text = 'get g\n  doc  file\n';
    const doc = apiDocument(host, text);
    expect(apiRepairs(doc, URI_OF, generated.check(doc.path, doc.text, doc), 0, 2)).toEqual([]);
  });

  it('through the service, before the explanation of the code', async () => {
    const path = `${SRC}/routes/usuarios.fudapi`;
    const uri = URI.file(path);
    const embedded = URI.parse(`volar-embedded-content://root/${encodeURIComponent(uri.toString())}`);
    const { host, implementations, generated } = world({ files: PROJECT });
    const decode = (u: URI): [URI, string] | undefined => (u.toString() === embedded.toString() ? [uri, 'root'] : undefined);
    const s: LanguageServicePluginInstance = createFudapiService({ host, implementations, generated, stats: new RequestStats() }).create(
      fakeServiceContext({}, decode),
    );
    const document = TextDocument.create(embedded.toString(), 'fudapi', 1, 'form f\n  avatar  file = "x"\n');
    const whole = { start: { line: 0, character: 0 }, end: { line: 9, character: 0 } };
    const actions = ((await s.provideCodeActions?.(document, whole, { diagnostics: [] }, CancellationToken.None)) ?? []) as CodeAction[];
    expect(actions.map((a) => a.title)).toEqual(['Remove the initial value', 'Explain FUD1482']);
    const hover = (await s.provideHover?.(document, { line: 1, character: 11 }, CancellationToken.None)) as Hover;
    expect((hover.contents as MarkupContent).value).toContain('A file');
  });
});
