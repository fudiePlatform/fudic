/**
 * Emmet, and the one thing it has to get right: WHERE.
 *
 * VS Code's own Emmet, switched on for a language, reparses the whole file as HTML and offers
 * `<div>` inside `@code`. The point of answering it here is the tree, so every test below is
 * about a region — the expansion itself is `@vscode/emmet-helper`'s and needs no proving.
 */

import { describe, expect, it } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DocumentCache } from '../../src/document-cache.js';
import { WorkspaceIndex } from '../../src/workspace-index.js';
import { emmetCompletions, isMarkupOffset } from '../../src/services/emmet.js';
import { memoryFs } from '../_support.js';

const PATH = '/p/components/app-card.fud';

const SOURCE = `@code {
  const { title } = props<{ title: string }>();
}

<head>
  <style>
    .card { color: red; }
  </style>
</head>

<app-card>
  <template shadowrootmode="open">
    <div class="card">hi @title</div>
  </template>
</app-card>
`;

/** The offset just after `needle`, which is where a cursor typing it would sit. */
function after(needle: string): number {
  const at = SOURCE.indexOf(needle);
  expect(at, `fixture must contain ${needle}`).toBeGreaterThan(-1);
  return at + needle.length;
}

function setup(source = SOURCE) {
  const index = new WorkspaceIndex(memoryFs({ [PATH]: source }));
  index.scan('/p');
  return new DocumentCache(index).get(PATH, 1, source);
}

describe('isMarkupOffset', () => {
  it('says yes inside the markup', () => {
    expect(isMarkupOffset(setup(), after('<div class="card">hi'))).toBe(true);
  });

  it('says no inside @code, which is TypeScript', () => {
    expect(isMarkupOffset(setup(), after('const { title } = '))).toBe(false);
  });

  it('says no inside <style>, whose body is CSS', () => {
    expect(isMarkupOffset(setup(), after('.card { color: '))).toBe(false);
  });

  it('says no inside an interpolation, which is an expression', () => {
    expect(isMarkupOffset(setup(), after('@titl'))).toBe(false);
  });

  it('says yes in a file with no @code at all', () => {
    const source = '<app-card>\n  <template shadowrootmode="open">\n    <p></p>\n  </template>\n</app-card>\n';
    expect(isMarkupOffset(setup(source), source.indexOf('<p>'))).toBe(true);
  });

  it('treats a raw element left unclosed as raw to the end of its span', () => {
    const source = '<app-card>\n  <template shadowrootmode="open">\n    <script>let a = 1;\n  </template>\n</app-card>\n';
    expect(isMarkupOffset(setup(source), source.indexOf('let a'))).toBe(false);
  });
});

describe('emmetCompletions', () => {
  const documentOf = (source: string): TextDocument =>
    TextDocument.create(`file://${PATH}`, 'fud', 1, source);

  it('expands an abbreviation typed in the markup', () => {
    const source = SOURCE.replace('<div class="card">hi @title</div>','ul>li*2');
    const cached = setup(source);
    const document = documentOf(source);
    const list = emmetCompletions(
      cached,
      document,
      document.positionAt(source.indexOf('ul>li*2') + 'ul>li*2'.length),
    );

    expect(list?.items[0]?.label).toBe('ul>li*2');
    expect(list?.items[0]?.textEdit?.newText).toContain('<ul>');
    expect(list?.items[0]?.textEdit?.newText).toContain('</li>');
  });

  it('keeps the list incomplete, so the editor asks again as the abbreviation grows', () => {
    const source = SOURCE.replace('<div class="card">hi @title</div>','ul>li');
    const cached = setup(source);
    const document = documentOf(source);
    const list = emmetCompletions(
      cached,
      document,
      document.positionAt(source.indexOf('ul>li') + 'ul>li'.length),
    );

    expect(list?.isIncomplete).toBe(true);
  });

  it('answers nothing inside @code', () => {
    const cached = setup();
    const document = documentOf(SOURCE);
    expect(
      emmetCompletions(cached, document, document.positionAt(after('const { title } = '))),
    ).toBeUndefined();
  });

  it('answers nothing where there is no abbreviation to expand', () => {
    const cached = setup();
    const document = documentOf(SOURCE);
    expect(
      emmetCompletions(cached, document, document.positionAt(after('<template '))),
    ).toBeUndefined();
  });
});
