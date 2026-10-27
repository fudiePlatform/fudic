/**
 * SDD-61 criterion 30 (task 22): the typed pass of the portable view, published by the editor
 * on the channel of every other `FUD`, with the span the build reports.
 *
 * The editor asks over the program its TypeScript service holds; the build over the one the
 * project checker builds. Two programs, one function: the spans have to be the same.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Diagnostic } from '@volar/language-service';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { clientFileName } from '@fudic/language-core';
import { createProjectChecker, toPosix } from '@fudic/typecheck';
import { DocumentCache } from '../../src/document-cache.js';
import { RequestStats } from '../../src/stats.js';
import { createFudicService } from '../../src/services/plugin.js';
import { WorkspaceIndex } from '../../src/workspace-index.js';
import { fakeServiceContext, TOKEN } from '../_lsp.js';
import { memoryFs, projectionService } from '../_support.js';

const PATH = '/p/components/app-vista.fud';

const SOURCE = `@code {
  function hora() { return 1; }
  const { nombre, n, m } = props<{ nombre: string | null; n: number; m: Readonly<Record<string, number>> }>();
}
<app-vista>
  <template shadowrootmode="open">
    @if (nombre) { <b></b> }
    <p>@hora() @(n < "a") @(m.length)</p>
  </template>
</app-vista>
`;

/** The codes of the typed pass. */
const TYPED: ReadonlySet<string> = new Set(['FUD1140', 'FUD1151', 'FUD1152', 'FUD1153']);

/** What the editor publishes of the typed pass, as `CODE text`. */
async function editor(): Promise<readonly string[]> {
  const index = new WorkspaceIndex(memoryFs({ [PATH]: SOURCE }));
  index.scan('/p');
  const cached = new DocumentCache(index).get(PATH, 1, SOURCE);
  const client = cached.virtuals.find((virtual) => virtual.fileName === clientFileName(cached.path))!;
  const document = TextDocument.create(URI.file(PATH).toString(), 'fud', 1, SOURCE);
  const context = fakeServiceContext({ [URI.file(PATH).toString()]: cached }, () => undefined, {
    'typescript/languageService': projectionService(cached.path, client.text),
  });
  const service = createFudicService({ index, stats: new RequestStats(), typescript: true }).create(context);
  const published = ((await service.provideDiagnostics?.(document, TOKEN)) ?? []) as Diagnostic[];
  return published
    .filter((d) => TYPED.has(String(d.code)))
    .map((d) => `${String(d.code)} ${SOURCE.slice(document.offsetAt(d.range.start), document.offsetAt(d.range.end))}`);
}

/** What the build reports of the typed pass, over the same file on disk. */
function build(): readonly string[] {
  const root = toPosix(mkdtempSync(join(tmpdir(), 'fudic-portable-ls-')));
  mkdirSync(join(root, 'components'), { recursive: true });
  writeFileSync(join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true, skipLibCheck: true }, include: ['**/*.fud'] }));
  writeFileSync(join(root, 'components/app-vista.fud'), SOURCE);
  return createProjectChecker({ root })
    .check()
    .problems.filter((p) => TYPED.has(p.code))
    .map((p) => `${p.code} ${SOURCE.slice(p.span.start, p.span.end)}`);
}

describe('the typed pass in the editor (criterion 30)', () => {
  it('publishes each code on the span the build reports', { timeout: 60_000 }, async () => {
    const expected = ['FUD1151 nombre', 'FUD1140 hora', 'FUD1152 "a"', 'FUD1153 m.length'];
    expect(await editor()).toEqual(expected);
    expect(build()).toEqual(expected);
  });
});
