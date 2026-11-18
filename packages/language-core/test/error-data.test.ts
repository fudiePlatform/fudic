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

  it('`@data.home` is a string, always there, and `@data.back` maybe (SDD-87 §3.4)', () => {
    expect(diagnosticsOf(ERROR, error('<a href=@data.home>home</a>@if (data.back !== undefined) { <a href=@data.back>back</a> }'))).toEqual([]);
    const diags = diagnosticsOf(ERROR, error('@code { const n: number = data.home; const s: string = data.back; }'));
    expect(diags.map((d) => [d.code, d.sourceText])).toEqual([[2322, 'n'], [2322, 's']]);
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

/** SDD-87 §4.3, criterion 17: the page a library offers, `src/_error.fud`, is typed by its name. */
describe('_error.fud of a library', () => {
  // A route that links a layout of the library, as every page does since SDD-88.
  const PAGE = (body: string): string => `<link rel="layout" href="./layouts/_layout.fud">\n<head><title>@data.status</title></head>\n${body}\n`;
  const LAYOUT = '<!DOCTYPE html>\n<html>\n<head>@RenderHead()</head>\n<body>@RenderBody()</body>\n</html>\n';
  const libDiagnostics = (source: string): readonly CorpusDiagnostic[] =>
    typecheckCorpus({ 'libs/ui/src/_error.fud': source, 'libs/ui/src/layouts/_layout.fud': LAYOUT }).filter(
      (d) => d.fud === 'libs/ui/src/_error.fud',
    );

  it('data.status is a number and data.home a string', () => {
    // A number has toFixed and no toUpperCase; a string, the other way round (2551: TS suggests `fixed`).
    expect(libDiagnostics(PAGE('<p>@(data.status.toFixed(0)) @(data.home.toUpperCase())</p>'))).toEqual([]);
    const diags = libDiagnostics(PAGE('<p>@(data.status.toUpperCase()) @(data.home.toFixed(0))</p>'));
    expect(diags.map((d) => [d.code, d.sourceText])).toEqual([[2339, 'toUpperCase'], [2551, 'toFixed']]);
    expect(libDiagnostics(PAGE('<h1>@data.status</h1><a href=@data.home>i</a>'))).toEqual([]);
  });

  it('data.foo is a type error', () => {
    const diags = libDiagnostics(PAGE('<p>@data.foo</p>'));
    expect(diags.map((d) => [d.code, d.sourceText])).toEqual([[2339, 'foo']]);
  });
});
