/**
 * `data` of a page that declares none (SDD-56 §3.6, SDD-60 §4.7): `_error.fud` has the problem it
 * paints, and a route without a `.fudapi` with `load` has `unknown`, so reading it fails in the
 * template. The real TypeScript, over the corpus.
 */
import { describe, expect, it } from 'vitest';
import { mapToGenerated } from '../src/mapping.js';
import { languageServiceFor, projectCorpus, typecheckCorpus, type CorpusDiagnostic } from './typecheck.js';

/** The checker's complaints about one file of the corpus. */
function diagnosticsOf(path: string, source: string): readonly CorpusDiagnostic[] {
  return typecheckCorpus({ [path]: source }).filter((d) => d.fud === path);
}

describe('a route without a .fudapi with load', () => {
  it('reads `data` as unknown: its use is an error in the template', () => {
    const diags = diagnosticsOf('users/[team].fud', '<link rel="layout" href="../layouts/_layout.fud">\n\n<p>@data.team</p>\n');

    expect(diags.map((d) => d.code)).toEqual([18046]);
    expect(diags[0]!.sourceText).toBe('data');
  });
});

describe('_error.fud paints the problem (§3.6)', () => {
  const ERROR = 'users/_error.fud';
  const error = (body: string): string => `<link rel="layout" href="../layouts/_layout.fud">

${body}
`;

  it('`@data.status`, `@data.title` and `@data.detail` are its data', () => {
    expect(diagnosticsOf(ERROR, error('<h1>@data.status @data.title</h1><p>@data.detail</p>'))).toEqual([]);
  });

  it('anything else is not', () => {
    const diags = diagnosticsOf(ERROR, error('<p>@data.stack</p>'));

    expect(diags).toHaveLength(1);
    expect(diags[0]!.code).toBe(2339);
    expect(diags[0]!.sourceText).toBe('stack');
  });

  /** The hover TypeScript shows at `needle` in the `_error.fud`, and its documentation. */
  function hoverAt(source: string, needle: string): { shown: string; docs: string } {
    const virtual = projectCorpus({ [ERROR]: source }).find((p) => p.file.path === ERROR)!.virtuals[0]!;
    const { service, pathOf } = languageServiceFor({ [ERROR]: source });
    const at = mapToGenerated(virtual, source.indexOf(needle), 'navigation');
    expect(at).toBeDefined();
    const info = service.getQuickInfoAtPosition(pathOf(virtual.fileName), at!);
    const text = (parts: readonly { text: string }[] | undefined) => (parts ?? []).map((p) => p.text).join('');
    return { shown: text(info?.displayParts).replace(/\s+/gu, ' '), docs: text(info?.documentation) };
  }

  it('the hover over `data` names its type, `ErrorPage`, and says who paints it (BUG-51)', () => {
    const { shown, docs } = hoverAt(error('<h1>@data.status</h1>'), 'data.status');

    expect(shown).toBe('const data: ErrorPage');
    expect(docs).toContain('`_error.fud` has no `load`');
    expect(docs).toContain('`ErrorPage` of `@fudic/http`');
  });

  it('and over each field, what it holds', () => {
    const source = error('<h1>@data.status @data.title</h1><p>@data.detail</p>');

    expect(hoverAt(source, 'status').docs).toBe('The HTTP status: 404, 401, 500…');
    expect(hoverAt(source, 'title').docs).toBe('The standard name of the status: `Not Found`.');
    expect(hoverAt(source, 'detail').shown).toBe('(property) ErrorPage.detail?: string | undefined');
    expect(hoverAt(source, 'detail').docs).toBe("What the server said, when it said something: `notFound('no such user')`.");
  });
});
