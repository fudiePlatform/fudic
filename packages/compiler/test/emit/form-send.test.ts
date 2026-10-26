/**
 * SDD-56 criterion 26, its compile part: `form:="@save"` hands `bindForm` the function, and
 * says so when it cannot send. Since SDD-60 the function is one of a linked `.fudapi`
 * (§3.14): the host answers with its facts, and its stub comes from `fudic:<id>`.
 */

import { describe, expect, it } from 'vitest';
import { resolveDocument } from '../../src/emit/resolve.js';
import { apiDiagnostics, emitRouteClientModule, emitRouteModuleMapped } from '../../src/emit/index.js';
import type { LinkedApi } from '../../src/types/io.js';
import { memoryIo } from './_support.js';

const LAYOUT = '<!DOCTYPE html><html><head>@RenderHead()</head><body>@RenderBody()</body></html>';

/** `routes/r.fudapi`: `load`, `save` and nothing else. */
const API: LinkedApi = { id: 'routes/r', load: true, paths: false, layout: false, functions: ['save'], forms: [] };

function route(server: string, client = '', body = '<p>x</p>', neutral = ''): string {
  return `<link rel="layout" href="./l.fud">
<link rel="server" href="./r.fudapi">
@code {
${neutral}
${server}
${client}
}
${body}`;
}

function graphOf(source: string) {
  const io = { ...memoryIo({ '/r.fud': source, '/l.fud': LAYOUT }), api: (path: string) => (path === '/r.fudapi' ? API : undefined) };
  return resolveDocument('/r.fud', io).value;
}

function chunk(source: string): string | null {
  return emitRouteClientModule(graphOf(source), {});
}

/**
 * What a build reports for the route's `form:=`: the render module's diagnostics and what the
 * links say together, deduplicated by code and span as the reporter shows them.
 */
function diagnosticsOf(source: string): { code: string; text: string }[] {
  const graph = graphOf(source);
  const seen = new Map<string, { code: string; text: string }>();
  for (const d of [...emitRouteModuleMapped(graph, {}).diagnostics, ...apiDiagnostics(graph)]) {
    if (d.code !== 'FUD1005' && d.code !== 'FUD1006') continue;
    seen.set(`${d.code}:${d.span.start}:${d.span.end}`, { code: d.code, text: source.slice(d.span.start, d.span.end) });
  }
  return [...seen.values()];
}

describe('form:= (criterion 26, its compile part)', () => {
  const server = '';
  const neutral = "  import { userForm } from './user.form';";

  it('hands the function to bindForm', () => {
    const code = chunk(route(server, '', '<form control=@userForm form:="@save"><button>ok</button></form>', neutral))!;
    expect(code).toMatch(/bindForm\([^)]*, null, save\)/u);
  });

  it('after the links of a summary with fields', () => {
    const code = chunk(
      route(
        server,
        '',
        '<form control=@userForm form:="@save"><div summary="@userForm" fields></div><input id="nom" control="@userForm.name"></form>',
        neutral,
      ),
    )!;
    // Then the ids of the form's fields, which `$issues()` links to (BUG-51).
    expect(code).toContain('bindForm($n0, userForm, $n1, {"name":"nom"}, save, {"name":"nom"})');
  });

  /** The `bindForm(…)` call of the route with `markup`, as the client chunk writes it. */
  const bindFormOf = (markup: string): string =>
    /bindForm\(.*\)\);/u.exec(chunk(route(server, '', markup, neutral))!)?.[0] ?? '';

  it('the ids of the fields go sixth, writing null and undefined for what is not there (BUG-51)', () => {
    expect(bindFormOf('<form control=@userForm><input id="nom" control=@userForm.name></form>')).toBe(
      'bindForm($n0, userForm, null, null, undefined, {"name":"nom"}));',
    );
  });

  it('with form:=@save, the function goes before them', () => {
    expect(bindFormOf('<form control=@userForm form:=@save><input id="nom" control=@userForm.name></form>')).toBe(
      'bindForm($n0, userForm, null, null, save, {"name":"nom"}));',
    );
  });

  it('with no field that has an id, no sixth argument, and the tail is cut', () => {
    expect(bindFormOf('<form control=@userForm><input control=@userForm.name></form>')).toBe(
      'bindForm($n0, userForm, null));',
    );
    expect(bindFormOf('<form control=@userForm form:=@save><input control=@userForm.name></form>')).toBe(
      'bindForm($n0, userForm, null, null, save));',
    );
  });

  it('a radio group is linked by its first radio, and a field with no id is left out', () => {
    const call = bindFormOf(
      '<form control=@userForm>' +
        '<input type="radio" id="r1" value="a" control=@userForm.kind>' +
        '<input type="radio" id="r2" value="b" control=@userForm.kind>' +
        '<input control=@userForm.name>' +
        '</form>',
    );
    expect(call).toContain('{"kind":"r1"}');
  });

  it('the map adds no attribute: a field with no id is written with none', () => {
    const code = chunk(route(server, '', '<form control=@userForm><input control=@userForm.name></form>', neutral))!;
    expect(code).not.toContain("'id'");
  });

  it('a dynamic id is no id to link to', () => {
    expect(bindFormOf('<form control=@userForm><input id="@(x)" control=@userForm.name></form>')).toBe(
      'bindForm($n0, userForm, null));',
    );
  });

  it('FUD1006: on an element that is not a <form>', () => {
    expect(diagnosticsOf(route(server, '', '<div control=@userForm form:="@save"></div>', neutral))).toEqual([
      { code: 'FUD1006', text: 'form:="@save"' },
    ]);
  });

  it('FUD1006: on a <form> without control=', () => {
    expect(diagnosticsOf(route(server, '', '<form form:="@save"></form>', neutral))).toEqual([
      { code: 'FUD1006', text: 'form:="@save"' },
    ]);
  });

  it('FUD1005: naming something that is not a function of a linked file', () => {
    const src = route(server, '    function local() {}', '<form control=@userForm form:="@local"></form>', neutral);
    expect(diagnosticsOf(src)).toEqual([{ code: 'FUD1005', text: 'local' }]);
  });

  it('FUD1005: naming load, which no browser calls', () => {
    const src = route(server, '', '<form control=@userForm form:="@load"></form>', neutral);
    expect(diagnosticsOf(src)).toEqual([{ code: 'FUD1005', text: 'load' }]);
  });

  it('FUD1005: a value that is not one @ expression', () => {
    const plain = diagnosticsOf(route(server, '', '<form control=@userForm form:="save"></form>', neutral));
    expect(plain.map((d) => d.code)).toEqual(['FUD1005']);
    const mixed = diagnosticsOf(route(server, '', '<form control=@userForm form:="x @save"></form>', neutral));
    expect(mixed.map((d) => d.code)).toEqual(['FUD1005']);
  });
});

