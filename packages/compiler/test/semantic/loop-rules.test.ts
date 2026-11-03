/**
 * Two rules that only the emit of a reactive file used to say, now said for every file by the
 * semantic pass (SDD-62 §8.2.2): `FUD0543`, a loop header that declares nothing, and `FUD0621`,
 * `data` read in the `@code` of a route or page whose links declare no `load`.
 */

import { describe, expect, it } from 'vitest';
import { viewDiagnostics } from './_view.js';

/** `CODE text` of the diagnostics of `code` over `source`. */
function found(source: string, code: string, apis?: { data: boolean; names: ReadonlySet<string> }): string[] {
  return viewDiagnostics(source, apis)
    .filter((d) => d.code === code)
    .map((d) => `${d.code} ${source.slice(d.span.start, d.span.end)}`);
}

const component = (template: string, code = '  const rows = [{ id: 1 }];\n  let r = rows[0];'): string =>
  `@code {\n${code}\n}\n<x-a><template shadowrootmode="open">${template}</template></x-a>`;

describe('FUD0543 — a loop header that declares a variable naming nothing (loop-bindings)', () => {
  it('an empty object or array pattern, in a @foreach and in a @for, on the header', () => {
    expect(found(component('@foreach (const {} of rows) key (1) { <p>x</p> }'), 'FUD0543')).toEqual([
      'FUD0543 (const {} of rows)',
    ]);
    expect(found(component('@foreach (const [] of rows) key (1) { <p>x</p> }'), 'FUD0543')).toHaveLength(1);
    expect(found(component('@for (let {} = r; false; ) key (1) { <p>x</p> }'), 'FUD0543')).toHaveLength(1);
  });

  it('a header that names something is not', () => {
    expect(found(component('@foreach (const row of rows) key (row.id) { <p>x</p> }'), 'FUD0543')).toEqual([]);
    expect(found(component('@foreach (const { id } of rows) key (id) { <p>x</p> }'), 'FUD0543')).toEqual([]);
    expect(found(component('@for (let i = 0; i < 3; i++) key (i) { <p>x</p> }'), 'FUD0543')).toEqual([]);
  });

  it('an assignment header, an unreadable one, a @for with no declaration and a @while are other rules', () => {
    // `r of rows` is FUD0900's; a header Oxc cannot read is FUD0170's; neither is said twice.
    expect(found(component('@foreach (r of rows) key (r) { <p>x</p> }'), 'FUD0543')).toEqual([]);
    expect(found(component('@foreach const r of rows { <p>x</p> }'), 'FUD0543')).toEqual([]);
    expect(found(component('@for (;;) key (1) { <p>x</p> }'), 'FUD0543')).toEqual([]);
    expect(found(component('@while (r) key (1) { <p>x</p> }'), 'FUD0543')).toEqual([]);
  });
});

describe('FUD0621 — `data` read in the @code with no linked `load` (data-without-load)', () => {
  const NO_LOAD = { data: false, names: new Set<string>() };
  const page = (code: string): string =>
    `<!DOCTYPE html><html><head>@code {\n${code}\n}</head><body><p>x</p></body></html>`;
  const route = (code: string): string => `<link rel="layout" href="./l.fud">\n@code {\n${code}\n}\n<p>x</p>\n`;

  it('a page and a route that read it, with links known and none declaring `load`: a warning on `data`', () => {
    for (const source of [page('  function hi() { return data.user; }'), route('  const u = data.user;')]) {
      const ds = viewDiagnostics(source, NO_LOAD).filter((d) => d.code === 'FUD0621');
      expect(ds.map((d) => source.slice(d.span.start, d.span.end))).toEqual(['data']);
      expect(ds[0]!.severity).toBe('warning');
    }
  });

  it('nothing when a link declares `load`, when the links are unknown, or when nobody reads it', () => {
    expect(found(page('  const u = data.user;'), 'FUD0621', { data: true, names: new Set() })).toEqual([]);
    expect(found(page('  const u = data.user;'), 'FUD0621')).toEqual([]);
    expect(found(page('  const u = 1;'), 'FUD0621', NO_LOAD)).toEqual([]);
  });

  it('a local named data is no read of it', () => {
    expect(found(page('  const data = { user: 1 };\n  const u = data.user;'), 'FUD0621', NO_LOAD)).toEqual([]);
  });

  it('nothing in a component or a layout, whose data is not its load', () => {
    expect(found(component('<p>x</p>', '  const u = data.user;'), 'FUD0621', NO_LOAD)).toEqual([]);
    const layout = `<!DOCTYPE html><html><head>@code {\n  const u = data.user;\n}\n@RenderHead()</head><body>@RenderBody()</body></html>`;
    expect(found(layout, 'FUD0621', NO_LOAD)).toEqual([]);
  });
});
