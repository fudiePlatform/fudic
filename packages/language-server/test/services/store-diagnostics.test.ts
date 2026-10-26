/**
 * SDD-61 §4.1, §5 — the editor reads the project's modules like the build does, and shows a
 * diagnostic the server cut reports in a store at its use in the `.fud`, with the store's place
 * as related information: what the editor marks, the build fails.
 */

import { describe, expect, it } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { analyze, span, type Diagnostic } from '@fudic/compiler';
import { semanticInput } from '@fudic/typecheck';
import { DocumentCache } from '../../src/document-cache.js';
import { WorkspaceIndex } from '../../src/workspace-index.js';
import { placedDiagnostics, toLspDiagnostic } from '../../src/services/plugin.js';
import { memoryFs } from '../_support.js';

const PAGE = '/p/src/routes/page.fud';
const STORE = '/p/src/store/contador.ts';
const SOURCE = `@code {\n  import { count } from '../store/contador.ts';\n}\n<x-a><template shadowrootmode="open"><p>@count()</p></template></x-a>`;
const STORE_SOURCE = `import { signal } from '@fudic/core';\nexport const count = signal(Math.random());`;

function workspace(): { readonly index: WorkspaceIndex; readonly document: TextDocument; readonly diagnostics: readonly Diagnostic[] } {
  const index = new WorkspaceIndex(memoryFs({ [PAGE]: SOURCE, [STORE]: STORE_SOURCE }));
  index.scan('/p');
  const cached = new DocumentCache(index).get(PAGE, 1, SOURCE);
  const diagnostics = analyze({ ...semanticInput(cached, index) }).diagnostics;
  return { index, document: TextDocument.create(URI.file(PAGE).toString(), 'fud', 1, SOURCE), diagnostics };
}

describe('a diagnostic of a store, in the editor', () => {
  it('the workspace index reads the store the server cut follows', () => {
    const { diagnostics } = workspace();
    expect(diagnostics.filter((d) => d.file === STORE).map((d) => [d.code, STORE_SOURCE.slice(d.span.start, d.span.end)])).toEqual([
      ['FUD0907', 'Math'],
    ]);
  });

  it('is shown at its use in the .fud, with the store as related information', () => {
    const { index, document, diagnostics } = workspace();
    const placed = placedDiagnostics(PAGE, diagnostics).filter((d) => d.code === 'FUD0907');
    const lsp = placed.map((d) => toLspDiagnostic(document, d, (path) => index.read(path)));
    expect(lsp.map((d) => document.getText(d.range))).toEqual(['count']);
    expect(lsp[0]?.relatedInformation).toEqual([
      {
        location: {
          uri: URI.file(STORE).toString(),
          range: { start: { line: 1, character: 28 }, end: { line: 1, character: 32 } },
        },
        message: 'reported here',
      },
    ]);
  });

  it('keeps what is already in the document, and drops what has no use in it', () => {
    const here: Diagnostic = { severity: 'error', code: 'FUD1150', message: 'm', span: span(1, 2) };
    const own: Diagnostic = { ...here, file: PAGE };
    const lost: Diagnostic = { ...here, file: STORE, related: [{ span: span(0, 1), message: 'x', file: '/p/otra.fud' }] };
    const bare: Diagnostic = { ...here, file: STORE };
    expect(placedDiagnostics(PAGE, [here, own, lost, bare])).toEqual([here, own]);
  });

  it('a related location in this document, or in a file that cannot be read, adds nothing', () => {
    const { document } = workspace();
    const diagnostic: Diagnostic = {
      severity: 'error',
      code: 'FUD1150',
      message: 'm',
      span: span(1, 2),
      related: [
        { span: span(0, 1), message: 'here' },
        { span: span(0, 1), message: 'gone', file: '/p/nada.ts' },
      ],
    };
    expect(toLspDiagnostic(document, diagnostic, () => undefined).relatedInformation).toBeUndefined();
    expect(toLspDiagnostic(document, diagnostic).relatedInformation).toBeUndefined();
  });
});
