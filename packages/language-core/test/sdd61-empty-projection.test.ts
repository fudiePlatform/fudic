/**
 * SDD-61 §4.3 — `@empty` in the projection: `if ($empty()) { … }` after the loop.
 *
 * Measured against the real checker over the corpus, like the other projection suites: what
 * is under test is the scope the body types with, not the text the emitter prints.
 */

import { describe, expect, it } from 'vitest';
import { collectTags, templateContent } from '../src/imports.js';
import { emitClient, parseFud } from './_support.js';
import { typecheckCorpus } from './typecheck.js';

const LIST = 'components/app-list.fud';

/** The corpus list, with `loop` in its `<ul>`. */
const list = (loop: string): string => `@code {
  type Row = { id: string; label: string };

  const { rows, title } = props<{ rows: Row[]; title: string }>();
}

<app-list>
  <template shadowrootmode="open">
    <ul>
      ${loop}
    </ul>
  </template>
</app-list>
`;

const FOREACH = `@foreach (const row of rows) key (row.id) {
        <li>@row.label</li>
      } @empty {
        <li>@title</li>
      }`;

describe('the projection of `@empty`', () => {
  it.each([
    ['@foreach', FOREACH],
    ['@for', '@for (let i = 0; i < rows.length; i++) key (i) { <li>@i</li> } @empty { <li>@title</li> }'],
    ['@while', '@while (rows.length > 9) key (title) { <li>x</li> } @empty { <li>@title</li> }'],
  ])('writes `if ($empty())` after the %s, with its body inside', (_, loop) => {
    const text = emitClient(list(loop)).text;

    const after = text.slice(text.indexOf('if ($empty()) {'));
    expect(after).not.toBe(text);
    expect(after).toContain('$text(title)');
  });

  it('writes nothing for a loop without one', () => {
    expect(emitClient(list('@foreach (const row of rows) key (row.id) { <li>x</li> }')).text).not.toContain('$empty');
  });

  it('types the body with the scope around the loop: `title` resolves', () => {
    const found = typecheckCorpus({ [LIST]: list(FOREACH) }).filter((d) => d.fud === LIST);

    expect(found).toEqual([]);
  });

  it('does not let the body see the item of the loop', () => {
    const loop = FOREACH.replace('<li>@title</li>', '<li>@row.label</li>');
    const found = typecheckCorpus({ [LIST]: list(loop) }).filter((d) => d.fud === LIST);

    // TS2552: «Cannot find name 'row'. Did you mean 'rows'?» — the item is out of scope.
    expect(found.map((d) => [d.code, d.sourceText])).toEqual([[2552, 'row']]);
  });

  it('collects the tags of the body, so their contracts are imported', () => {
    const source = list(FOREACH.replace('<li>@title</li>', '<app-badge></app-badge>'));

    expect(collectTags(templateContent(parseFud(source)))).toContain('app-badge');
  });
});
