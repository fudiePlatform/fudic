/**
 * SDD-80 §4.7: what the projection writes for `$value`, for a named handler, for
 * `@fudic:result` on a component's host, and the registry of what a component's forms return.
 * The types those lines give are checked end to end in `@fudic/typecheck`.
 */

import { describe, expect, it } from 'vitest';
import { emitClient } from './_support.js';

const component = (tag: string, code: string, markup: string, before = ''): string =>
  `${before}@code {\n${code}\n}\n\n<${tag}>\n  <template shadowrootmode="open">\n    ${markup}\n  </template>\n</${tag}>\n`;

const text = (source: string): string => emitClient(source).text;

describe('$value (§3.5)', () => {
  it('is declared before the call with the type of its control', () => {
    expect(text(component('x-a', '  function f(v: boolean) {}', '<input type="checkbox" @change=@f($value)>'))).toContain(
      "$on('change', ($event) => { const $value = $event as unknown as boolean; return f($value); });",
    );
  });

  it('delegated, inside the scope the loop header re-opens', () => {
    const out = text(
      component(
        'x-a',
        '  const ps: { id: number }[] = [];\n  function f(p: unknown, n: number | null) {}',
        '<ul @input=@f(p, $value)>@foreach (const p of ps) key (p.id) { <li><input type="number" delegate:p></li> }</ul>',
      ),
    );
    expect(out).toContain("$on('input', ($event) => { const $value = $event as unknown as number | null; for (const p of ps) { return f(p, $value); } });");
  });

  it('where there is no control it is any: the FUD speaks, TypeScript does not', () => {
    expect(text(component('x-a', '  function f(v: string) {}', '<div @click=@f($value)></div>'))).toContain(
      'const $value = $event as unknown as any;',
    );
  });

  it('a handler with no $value is written as before', () => {
    expect(text(component('x-a', '  function f() {}', '<input @input=@f()>'))).toContain("$on('input', ($event) => f());");
  });
});

describe('a named handler (§3.6)', () => {
  it('projects its event alone: `@click.borrar` is `$on(\'click\', …)`', () => {
    const out = text(
      component(
        'x-a',
        '  const ps: { id: number }[] = [];\n  function borrar(p: unknown) {}',
        '<ul @click.borrar=@borrar(p)>@foreach (const p of ps) key (p.id) { <li delegate:p="click.borrar">x</li> }</ul>',
      ),
    );
    expect(out).toContain("$on('click', ($event) => { for (const p of ps) { return borrar(p); } });");
  });
});

describe('@fudic:result on the host (§3.7)', () => {
  const USES = '<link rel="component" href="./x-form.fud">\n';

  it('on a component tag, the datum is what that component registers', () => {
    const out = text(component('x-a', '  function alta(p: unknown) {}', '<x-form @fudic:result=@alta></x-form>', USES));
    expect(out).toContain("$onResultOf<'x-form'>(alta);");
  });

  it('the call form gets the event', () => {
    const out = text(component('x-a', '  function alta(p: unknown) {}', '<x-form @fudic:result=@alta($event.detail)></x-form>', USES));
    expect(out).toContain("$onResultOfEvent<'x-form'>(($event) => alta($event.detail));");
  });

  it('a component tag with its own form:= keeps that form\'s type', () => {
    const out = text(component('x-a', '  function save() {}\n  function alta(p: unknown) {}', '<x-form form:=@save @fudic:result=@alta></x-form>', USES));
    expect(out).toContain('$onResult(save, alta);');
  });

  it('a native element is unchanged', () => {
    expect(text(component('x-a', '  function alta(p: unknown) {}', '<div @fudic:result=@alta></div>'))).toContain('$onResult(undefined, alta);');
  });
});

describe('the registry of form results (§4.7)', () => {
  const entry = (out: string): string | undefined => /^ {4}("x-[a-z-]+": .*);$/mu.exec(out)?.[1];

  it('the union of its form:= and of the components it uses', () => {
    const out = text(
      component(
        'x-user',
        '  import { save, api } from "./x";',
        '<form form:=@save></form><form form:=@api.update></form><form form:=@save></form><x-address></x-address><x-user></x-user>',
        '<link rel="component" href="./x-address.fud">\n',
      ),
    );
    expect(entry(out)).toBe('"x-user": $Result<typeof save> | $Result<typeof api.update> | $FormResult<"x-address">');
    expect(out.trimEnd().endsWith('export {};')).toBe(true);
  });

  it('a form:= the @code does not name, or that is not a path, registers nothing', () => {
    const out = text(component('x-user', '  const x = 1;', '<form form:=@ghost></form><form form:=@(pick())></form>'));
    expect(out).not.toContain('FudicFormResults');
  });

  it('a component with no @code, no form and no component writes no block', () => {
    expect(text('<x-plain>\n  <template shadowrootmode="open"><p>hola</p></template>\n</x-plain>\n')).not.toContain('FudicFormResults');
  });

  it('a page registers nothing', () => {
    const page = '<html><head></head><body><form></form></body></html>\n';
    expect(text(page)).not.toContain('FudicFormResults');
  });
});
