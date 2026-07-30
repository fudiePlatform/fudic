/**
 * The reserved `$` namespace (SDD-24 §4.4, §6.11).
 *
 * The three cases that separate a rule from a regular expression: `$x` is reserved, `foo$` is
 * a name that happens to end in `$`, and `obj.$bar` is a member of someone else's object.
 */

import { describe, expect, it } from 'vitest';
import { DocumentCache } from '../../src/document-cache.js';
import { WorkspaceIndex } from '../../src/workspace-index.js';
import { reservedDollarDiagnostics } from '../../src/services/reserved-dollar.js';
import { component, memoryFs } from '../_support.js';

const PATH = '/p/components/app-x.fud';

/** A component whose `@client` region holds `code`. */
const withClient = (code: string): string =>
  `@code {\n  @client {\n${code}\n  }\n}\n\n${component('app-x')}`;

function diagnosticsOf(source: string) {
  const index = new WorkspaceIndex(memoryFs({ [PATH]: source }));
  index.scan('/p');
  const document = new DocumentCache(index).get(PATH, 1, source);

  return { source, diagnostics: reservedDollarDiagnostics(document) };
}

describe('reservedDollarDiagnostics', () => {
  it('reports a declaration with the exact span of the identifier', () => {
    const { source, diagnostics } = diagnosticsOf(withClient('    const $x = 1;'));

    expect(diagnostics.length).toBe(1);
    expect(diagnostics[0]?.code).toBe('FUD0461');
    expect(source.slice(diagnostics[0]?.span.start, diagnostics[0]?.span.end)).toBe('$x');
  });

  it('reports a free reference too: reading scaffolding is as wrong as declaring it', () => {
    const { diagnostics } = diagnosticsOf(withClient('    console.log($tpl);'));

    expect(diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
      '"$tpl" is reserved: identifiers starting with $ belong to the compiler',
    ]);
  });

  it('reports inside the @server region as well', () => {
    const source = `@code {\n  @server {\n    const $secret = 1;\n  }\n}\n\n${component('app-x')}`;

    expect(diagnosticsOf(source).diagnostics.length).toBe(1);
  });

  it('leaves foo$ alone: only the prefix is reserved', () => {
    expect(
      diagnosticsOf(withClient('    const foo$ = 1;\n    const a$b = foo$;')).diagnostics,
    ).toEqual([]);
  });

  it('leaves obj.$bar and { $bar: 1 } alone: they name someone else’s member', () => {
    const { diagnostics } = diagnosticsOf(
      withClient('    const obj = { $bar: 1 };\n    const read = obj.$bar;'),
    );

    expect(diagnostics).toEqual([]);
  });

  it('does look inside a computed member, where the identifier is a real reference', () => {
    const { diagnostics } = diagnosticsOf(withClient('    const read = window[$key];'));

    expect(diagnostics.length).toBe(1);
  });

  it('walks past what is not a node at all, such as an array hole', () => {
    const { diagnostics } = diagnosticsOf(withClient('    const holes = [1, , $x];'));

    expect(diagnostics.length).toBe(1);
  });

  it('says nothing about the neutral zone, which §4.4 does not cover', () => {
    const source = `@code {\n  const $neutral = 1;\n}\n\n${component('app-x')}`;

    expect(diagnosticsOf(source).diagnostics).toEqual([]);
  });

  it('says nothing about a file with no @code at all', () => {
    expect(diagnosticsOf(component('app-x')).diagnostics).toEqual([]);
  });
});
