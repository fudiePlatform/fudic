/**
 * One fact, one voice, in the editor (SDD-62 §8.2.2, task 24): where a fudic error speaks,
 * TypeScript's diagnostic of the same stretch of the projection is not shown. A TypeScript error
 * anywhere else is.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DocumentDiagnosticRequest,
  type Diagnostic,
  type FullDocumentDiagnosticReport,
} from 'vscode-languageserver-protocol/node';
import { startHarness, type Harness } from './_harness.js';

let harness: Harness;

beforeAll(async () => {
  harness = await startHarness();
}, 60_000);

afterAll(async () => {
  await harness.stop();
});

/** A component of its own, opened, and what the server reports about it: code, and the text under it. */
async function report(name: string, text: string): Promise<{ code: string; text: string }[]> {
  const { uri } = await harness.open(`src/components/${name}.fud`, text);
  const got = (await harness.client.sendRequest(DocumentDiagnosticRequest.type, {
    textDocument: { uri },
  })) as FullDocumentDiagnosticReport;
  const lines = text.split('\n');
  const under = (d: Diagnostic): string =>
    d.range.start.line === d.range.end.line
      ? (lines[d.range.start.line] ?? '').slice(d.range.start.character, d.range.end.character)
      : '';
  return got.items
    .filter((item) => (item.severity ?? 1) <= 2)
    .map((item) => ({ code: String(item.code), text: under(item) }));
}

const component = (tag: string, code: string, template: string): string => `@code {
${code}
}

<${tag}>
  <template shadowrootmode="open">${template}</template>
</${tag}>
`;

describe('TypeScript is silent where a fudic error speaks', () => {
  it('a name the view cannot read is FUD0907 alone, not also TypeScript’s «cannot find name»', async () => {
    const found = await report('voice-name', component('voice-name', '  const shown = 1;', '<p>@nope @shown</p>'));

    expect(found.filter((d) => d.text === 'nope')).toEqual([{ code: 'FUD0907', text: 'nope' }]);
    expect(found.filter((d) => !d.code.startsWith('FUD'))).toEqual([]);
  });

  it('a tag nobody links is FUD0191 alone, whatever TypeScript makes of its bindings', async () => {
    const found = await report(
      'voice-link',
      component('voice-link', '  const title = "t";', '<app-badge .tone=@title .ghost=@title></app-badge>'),
    );

    expect(found.map((d) => d.code)).toContain('FUD0191');
    expect(found.filter((d) => !d.code.startsWith('FUD'))).toEqual([]);
  });

  it('a TypeScript error that meets no fudic error is still shown', async () => {
    const found = await report(
      'voice-type',
      component('voice-type', "  const n: number = 'x';\n  const shown = n;", '<p>@nope @shown</p>'),
    );

    // The type error of `@code` is TypeScript's alone, and it stays; `nope` is still fudic's.
    expect(found).toContainEqual({ code: '2322', text: 'n' });
    expect(found.filter((d) => d.text === 'nope').map((d) => d.code)).toEqual(['FUD0907']);
  });
});
