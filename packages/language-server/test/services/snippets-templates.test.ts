/**
 * SDD-28 §3.2 / criterion 2 — the skeletons and the CLI templates are the same text.
 *
 * `fudic g component` and the `component` snippet have to hand over the same file. They are
 * not the same call: the server ships as a single bundle, so its bodies are constants, while
 * the CLI reads real files from `templates/`. What keeps them from drifting is this test —
 * the same arrangement that already keeps the editor's formatter and `fudic fmt` honest.
 *
 * The templates are materialized with the TABSTOPS as their placeholder values, because that
 * is what a snippet body is: the template with its holes named for the editor instead of
 * filled in.
 */

import { describe, expect, it } from 'vitest';
import {
  codeBlock,
  indent,
  renderTemplate,
  renderSectionBlocks,
  sectionBlocks,
  serverCodeBlock,
  styleBlock,
} from '@fudic/cli';
import { SNIPPETS } from '../../src/services/snippets.js';

/** The body the catalogue offers for a label, in the `empty-document` scope. */
function bodyOf(label: string): string {
  const found = SNIPPETS.find(
    (snippet) => snippet.label === label && snippet.scope === 'empty-document',
  );
  expect(found, `no skeleton labelled ${label}`).toBeDefined();
  return found!.body;
}

describe('the skeletons are the CLI templates', () => {
  it('component', () => {
    expect(bodyOf('component')).toBe(
      renderTemplate('component.fud', {
        code: codeBlock(),
        head: styleBlock(),
        tag: '${1:app-button}',
        body: '    $0\n',
      }),
    );
  });

  it('route', () => {
    expect(bodyOf('route')).toBe(
      renderTemplate('route.fud', {
        layoutHref: '${1:../layouts/_layout.fud}',
        code: serverCodeBlock(),
        title: '${2:@data.title}',
        sections: sectionBlocks([]),
      }),
    );
  });

  it('page', () => {
    expect(bodyOf('page')).toBe(
      renderTemplate('page.fud', {
        lang: '${1:en}',
        title: '${2:Home}',
        code: indent(serverCodeBlock(), '    '),
      }),
    );
  });

  it('layout', () => {
    expect(bodyOf('layout')).toBe(
      renderTemplate('layout.fud', {
        lang: '${1:en}',
        renderHead: '    @RenderHead()',
        sections: renderSectionBlocks(['${2:nav}']),
      }),
    );
  });

  it('bites: a body that drifts by one space is caught', () => {
    const drifted = bodyOf('component').replace('<style></style>', '<style> </style>');

    expect(drifted).not.toBe(
      renderTemplate('component.fud', {
        code: codeBlock(),
        head: styleBlock(),
        tag: '${1:app-button}',
        body: '    $0\n',
      }),
    );
  });
});
