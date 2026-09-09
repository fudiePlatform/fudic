/**
 * A signal that lives in a MODULE, not in the component that reads it — a store.
 *
 * The reactive list of `client.ts` is built from what this file can READ: a
 * `const x = signal(…)` declarator, and a prop whose type says `Signal<T>`. An import
 * declares neither. The module is another file, the emit is per file, and until this landed
 * a store crossed by reference, was read correctly by the template, and never repainted —
 * the value right, nobody listening, and the fault appearing or vanishing with whatever
 * happened to repaint beside it.
 *
 * So the name is handed to `$subIf`, which asks the VALUE at run time. What is checked here
 * is which names get that line and which do not: a type import is erased before the chunk
 * runs, so subscribing one is a `ReferenceError` on the first hookup, and the framework's
 * own exports are never a component's state.
 */

import { describe, expect, it } from 'vitest';
import { resolveComponents, emitComponentClientModule } from '../../src/emit/index.js';
import { memoryIo } from './_support.js';

/** One component alone in its graph, with the given `@code` body and template. */
const chunk = (code: string, template = '<span>@count()</span>'): string => {
  const io = memoryIo({
    '/page.fud':
      '<link rel="component" href="./x-own.fud">\n' +
      '<html><head></head><body><x-own></x-own></body></html>\n',
    '/x-own.fud':
      `@code {\n${code}}\n` +
      `<x-own>\n  <template shadowrootmode="open">${template}</template>\n</x-own>\n`,
  });
  const g = resolveComponents('/page.fud', io);
  return emitComponentClientModule(g, g.components.get('x-own')!, {});
};

/** The hookup body, which is where every subscription is registered. */
const hookup = (src: string): string =>
  src.slice(src.indexOf('const $s = () => {'), src.indexOf('const $a'));

describe('emitComponentClientModule — a signal imported from a module', () => {
  it('subscribes an imported name through the guarded channel', () => {
    const src = chunk('  import { count } from "../store.js";\n');
    expect(src).toContain("import { FudicElement, subscribeIf as $subIf } from '@fudic/core';");
    expect(hookup(src)).toContain('$d.push($subIf(count, $u));');
    // And the pass it renews is the same one a declared signal renews: one body, so a value
    // that moves by store and one that moves by declaration cannot be applied differently.
    expect(src).toContain('u: () => { $u(); },');
  });

  it('reads the import from the NEUTRAL zone, where a store has to live', () => {
    // The template is painted on both sides, so a store imported inside `@client` leaves the
    // server with no such name and the route fails to prerender. The neutral zone is the only
    // place it can go, and it was the only place this pass did not look.
    const src = chunk('  import { count } from "../store.js";\n  @client {\n  }\n');
    expect(hookup(src)).toContain('$d.push($subIf(count, $u));');
  });

  it('and from `@client` too, for a store nothing but the browser reads', () => {
    const src = chunk(
      '  @client {\n    import { count } from "../store.js";\n  }\n',
      '<span>@(1)</span>',
    );
    expect(hookup(src)).toContain('$d.push($subIf(count, $u));');
  });

  it('never subscribes a TYPE import: the binding is erased before the chunk runs', () => {
    const src = chunk(
      '  import type { Contador } from "../store.js";\n' +
        '  import { count } from "../store.js";\n' +
        '  const uno: Contador = 1;\n',
    );
    expect(hookup(src)).toContain('$subIf(count,');
    expect(src).not.toContain('$subIf(Contador,');
  });

  it('narrows a mixed import to its value specifiers', () => {
    const src = chunk('  import { type Contador, count } from "../store.js";\n');
    expect(hookup(src)).toContain('$subIf(count,');
    expect(src).not.toContain('$subIf(Contador,');
  });

  it('leaves the framework alone: `signal` and `emit` are not a component state', () => {
    const src = chunk(
      '  @client {\n' +
        '    import { signal } from "@fudic/core";\n' +
        '    import { emit } from "@fudic/dom";\n' +
        '    const count = signal(0);\n' +
        '    function ping() { emit("p", 1); }\n' +
        '  }\n',
    );
    expect(src).not.toContain('$subIf');
    expect(hookup(src)).toContain('$d.push($sub(count, $u));');
  });

  it('takes a default and a namespace import, which bind a name all the same', () => {
    const src = chunk(
      '  import store from "../store.js";\n' + '  import * as todo from "../todo.js";\n',
      '<span>@store.n()</span>',
    );
    expect(hookup(src)).toContain('$d.push($subIf(store, $u));');
    expect(hookup(src)).toContain('$d.push($subIf(todo, $u));');
  });

  it('carries both channels when the component has a signal AND reads a store', () => {
    // Each channel brings only its own name, and a component that uses both brings the two.
    const src = chunk(
      '  import { count } from "../store.js";\n' +
        '  @client {\n' +
        '    import { signal } from "@fudic/core";\n' +
        '    const n = signal(0);\n' +
        '  }\n',
      '<span>@count() @(n())</span>',
    );
    expect(src).toContain(
      "import { FudicElement, subscribe as $sub, subscribeIf as $subIf } from '@fudic/core';",
    );
    expect(hookup(src)).toContain('$d.push($sub(n, $u));');
    expect(hookup(src)).toContain('$d.push($subIf(count, $u));');
  });

  it('emits no channel at all when the view has nothing a write could change', () => {
    // Same rule as a declared signal: no value write and no construct means a `set` has
    // nothing to move, and a subscription would be a line every instance downloads.
    const src = chunk('  import { count } from "../store.js";\n', '<b>hi</b>');
    expect(src).toContain("import { FudicElement } from '@fudic/core';");
    expect(src).not.toContain('$subIf');
    expect(src).not.toContain('const $u =');
  });
});
