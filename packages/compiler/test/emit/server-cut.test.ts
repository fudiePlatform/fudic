/**
 * The server cut of a `@code` (SDD-60 §4.8).
 *
 * The `@code` is browser code. The SSR and the Service Worker evaluate only what the markup
 * reads, transitively, plus every top-level `provide` and the `props<T>()`; `effect` never.
 * What the cut holds is what `extractCode` puts in `neutral` (both sides); the rest goes to
 * `client.body` (the browser alone).
 */

import { describe, expect, it } from 'vitest';
import { extractCode, type ExtractedCode } from '../../src/emit/oxc-code.js';
import type { CodeDocument } from '../../src/emit/oxc-code.js';
import { atConstructs } from '../../src/constructs.js';
import { structureDocument, type StructuredDocument } from '../../src/document/index.js';
import { parseDocument } from '../../src/html/index.js';

/** Every construct, `@RenderBody()` included: a layout is recognised by its hole. */
const parse = (source: string): StructuredDocument =>
  structureDocument(source, parseDocument(source, { atConstructs }).value).value;

const component = (code: string, markup: string): string =>
  `@code {\n${code}\n}\n<m-el>\n  <template shadowrootmode="open">${markup}</template>\n</m-el>\n`;

function extract(source: string): ExtractedCode {
  return extractCode(source, parse(source) as CodeDocument);
}

/** The texts on the server side (the cut) and on the browser's alone, imports included. */
function split(code: string, markup = '<p>x</p>'): { server: string[]; client: string } {
  const out = extract(component(code, markup));
  return {
    server: out.neutral.map((s) => s.text),
    client: [...out.client.imports, ...out.client.body.map((s) => s.text)].join('\n'),
  };
}

describe('what the markup reads, transitively', () => {
  it('a name the markup reads is cut, with what its initializer reads', () => {
    const { server, client } = split('  const a = 1;\n  const b = a + 1;\n  const c = 3;', '<p>@b</p>');
    expect(server).toEqual(['const a = 1;', 'const b = a + 1;']);
    expect(client).toContain('const c = 3;');
    expect(client).not.toContain('const b');
  });

  it('through a function body and an import', () => {
    const { server } = split(
      "  import { fmt } from './fmt.js';\n  function label(n: number) { return fmt(n); }",
      '<p>@label(1)</p>',
    );
    expect(server).toEqual(["import { fmt } from './fmt.js';", 'function label(n: number) { return fmt(n); }']);
  });

  it('a class the markup reads is cut', () => {
    const { server } = split('  class Box { v = 1; }\n  const box = new Box();', '<p>@box.v</p>');
    expect(server).toEqual(['class Box { v = 1; }', 'const box = new Box();']);
  });

  it('an import nobody reads stays in the browser', () => {
    const { server, client } = split("  import { fmt } from './fmt.js';");
    expect(server).toEqual([]);
    expect(client).toContain('./fmt.js');
  });

  it('a re-export names nothing and pulls nothing', () => {
    const { server } = split('  const a = 1;\n  export { a };', '<p>x</p>');
    expect(server).toEqual([]);
  });

  it('a type declaration is always cut, and erased', () => {
    const out = extract(component('  type T = number;\n  const a: T = 1;', '<p>@a</p>'));
    expect(out.neutral.map((s) => s.text)).toEqual(['const a: T = 1;']);
  });
});

describe('what is always in the cut, and what never is', () => {
  it('a top-level `provide`, read or not', () => {
    const { server } = split("  import { provide } from '@fudic/di';\n  provide(Cart, () => new Cart());\n  class Cart {}");
    expect(server.some((s) => s.startsWith('provideIn('))).toBe(true);
    expect(server).toContain('class Cart {}');
  });

  it('the props, read or not', () => {
    const out = extract(component('  const { title } = props<{ title: string }>();', '<p>x</p>'));
    expect(out.props.map((p) => p.name)).toEqual(['title']);
  });

  it('`effect` never, even when the markup reads what it returns', () => {
    const { server, client } = split("  import { effect } from '@fudic/core';\n  const stop = effect(() => {});", '<p>@stop</p>');
    expect(server).toEqual([]);
    expect(client).toContain('effect(');
  });

  it('`effect` is not FUD0570: it goes anywhere in the `@code`', () => {
    const out = extract(component("  import { effect } from '@fudic/core';\n  effect(() => {});", '<p>x</p>'));
    expect(out.diagnostics.map((d) => d.code)).not.toContain('FUD0570');
  });
});

describe('what the markup does not read while painting', () => {
  it('the value of an event, of `ref=` and of `bus:` does not seed', () => {
    const { server } = split(
      '  function save() {}\n  let el;\n  function onBus() {}',
      '<button @click=@(save)>s</button><p ref=@el>x</p><p bus:done=@onBus>y</p>',
    );
    expect(server).toEqual([]);
  });

  it('a deferred attribute written as plain text names nothing', () => {
    const { server } = split('  const go = 1;', '<p ref="go">x</p>');
    expect(server).toEqual([]);
  });

  it('`bus:(expr)` paints its event name, never its handler', () => {
    const { server } = split('  const evt = "done";\n  function onBus() {}', '<p bus:(evt)="@onBus">y</p>');
    expect(server).toEqual(['const evt = "done";']);
  });

  it('a bare function name handed to a prop crosses as a cell, and does not pull its function', () => {
    const { server } = split('  function save() {}', '<x-child .onSave=@save></x-child>');
    expect(server).toEqual([]);
  });

  it('a call of the same function does pull it', () => {
    const { server } = split('  function label() { return 1; }', '<x-child .v=@label()></x-child>');
    expect(server).toEqual(['function label() { return 1; }']);
  });
});

describe('what makes the file hydrate (clientRuns)', () => {
  it('a top-level statement that runs at load', () => {
    expect(extract(component('  document.title = "x";', '<p>x</p>')).clientRuns).toBe(true);
  });

  it('a declaration nobody calls does not', () => {
    expect(extract(component('  function later() {}\n  const n = 1;', '<p>x</p>')).clientRuns).toBe(false);
  });

});

describe('a layout has no cut', () => {
  it('a statement in its `@code` does not make it hydrate: there is no browser half', () => {
    const layout =
      '<!DOCTYPE html>\n<html lang="es">\n<head>\n@code {\n  document.title = "x";\n}\n@RenderHead()\n</head>\n' +
      '<body>\n<main>@RenderBody()</main>\n</body>\n</html>\n';
    expect(parse(layout).type).toBe('layout-document');
    expect(extract(layout).clientRuns).toBe(false);
  });
});

describe('every name the `@code` declares (declared)', () => {
  it('whatever half it went to', () => {
    const out = extract(component('  const a = 1;\n  function f() {}\n  const b = 2;', '<p>@a</p>'));
    expect([...out.declared].sort()).toEqual(['a', 'b', 'f']);
  });
});

describe('a reactive the markup reads', () => {
  it('is the browser\'s own declaration: the server renders it inert from what was read', () => {
    const out = extract(component('  import { signal } from "@fudic/core";\n  const n = signal(1);', '<p>@n()</p>'));
    // Its `signal` is the browser's too: the server's inert value reads the arguments alone.
    expect(out.neutral).toEqual([]);
    expect(out.client.imports).toEqual(['import { signal } from "@fudic/core";']);
    expect(out.client.body.map((s) => s.text)).toEqual(['const n = signal(1);']);
    expect(out.clientNames).toContain('n');
    expect(out.signals.map((s) => s.name)).toEqual(['n']);
  });

  it('beside a plain declarator the markup reads too, the line stays in the cut', () => {
    const out = extract(component('  import { signal } from "@fudic/core";\n  const n = signal(1), k = 2;', '<p>@n() @k</p>'));
    expect(out.neutral.map((s) => s.text)).toContain('const k = 2;');
    expect(out.client.body).toEqual([]);
  });

  it('a prop is no reactive: it stays where the cut puts it', () => {
    const out = extract(component('  const { v } = props<{ v: number }>();', '<p>@v</p>'));
    expect(out.client.body).toEqual([]);
  });
});

describe('what a reactive reads', () => {
  it('a computed brings what its derive function reads, never `computed`', () => {
    const out = extract(
      component('  import { computed } from "@fudic/core";\n  import { fmt } from "./fmt.js";\n  const label = computed(() => fmt(1));', '<p>@label()</p>'),
    );
    expect(out.neutral.map((s) => s.text)).toEqual(['import { fmt } from "./fmt.js";']);
  });

  it('a declaration that is not all reactives reads all of it', () => {
    const out = extract(component('  import { signal } from "@fudic/core";\n  const n = signal(1), k = 2;', '<p>@n() @k</p>'));
    expect(out.neutral.map((s) => s.text)).toContain('import { signal } from "@fudic/core";');
  });
});
