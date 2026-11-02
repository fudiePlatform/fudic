/**
 * SDD-72 §4.4 — which `bus:` bindings register their handler in `FudicBusReceivers`, and the
 * block the projection writes at the end of the module.
 *
 * Only a reference to a name the `@code` declares at its top level registers: the block is
 * written outside `$tpl`, where a loop variable or a snippet parameter does not exist. What the
 * checker makes of the registry is `sdd72-handler-types.test.ts`'s; this is the text.
 */

import { describe, expect, it } from 'vitest';
import { emitClientVirtual } from '../src/emit-client.js';
import { emitClient, parseFud, registryOf } from './_support.js';

/** A component with `code` in its `@code` and `markup` in its shadow root. */
const bus = (code: string, markup: string, before = ''): string => `${before}@code {
${code}
}

<x-bus>
  <template shadowrootmode="open">
    ${markup}
  </template>
</x-bus>
`;

/** The registry entries of the projection, one line each. */
const entries = (text: string): string[] => [...text.matchAll(/^ {4}("[^"]+": readonly .*);$/gmu)].map((m) => m[1]!);

describe('the registry of bus receivers (§4.4)', () => {
  it('a reference to a top-level function, const or let registers, numbered in source order', () => {
    const { text } = emitClient(
      bus(
        '  function alta(p: number) {}\n  const baja = (p: string) => {};\n  let otra = (p: boolean) => {};',
        '<div bus:alta=@alta bus:baja=@baja></div><i bus:alta=@otra></i>',
      ),
      'src/routes/usuarios.fud',
    );
    expect(entries(text)).toEqual([
      '"src/routes/usuarios.fud#0": readonly ["alta", $BusParam<typeof alta>]',
      '"src/routes/usuarios.fud#1": readonly ["baja", $BusParam<typeof baja>]',
      '"src/routes/usuarios.fud#2": readonly ["alta", $BusParam<typeof otra>]',
    ]);
    // Once, at the end of the module, after the template function.
    expect(text.match(/declare global/gu)).toHaveLength(1);
    expect(text.indexOf('declare global')).toBeGreaterThan(text.indexOf('$tpl'));
    expect(text.trimEnd().endsWith('export {};')).toBe(true);
  });

  it('the key uses / even for a path written with \\', () => {
    const { text } = emitClient(bus('  function alta() {}', '<div bus:alta=@alta></div>'), 'C:\\app\\src\\x.fud');
    expect(entries(text)).toEqual(['"C:/app/src/x.fud#0": readonly ["alta", $BusParam<typeof alta>]']);
  });

  it('a lambda, a call, an expression name and a name the @code does not declare register nothing', () => {
    const { text } = emitClient(
      bus(
        '  function alta(p: number) {}\n  const NOMBRE = "alta";',
        '<div bus:alta=@(p => p) bus:baja=@alta($event) bus:(NOMBRE)=@alta bus:otra=@ghost></div>',
      ),
    );
    expect(entries(text)).toEqual([]);
    // No receiver, no block: the module stays what it was.
    expect(text).not.toContain('FudicBusReceivers');
    expect(text).not.toContain('export {};');
  });

  it('a prop registers nothing: it is no top-level declaration of the @code', () => {
    const { text } = emitClient(
      bus('  const { onAlta } = props<{ onAlta: (p: number) => void }>();', '<div bus:alta=@onAlta></div>'),
    );
    expect(entries(text)).toEqual([]);
  });

  it('inside a loop whose header declares the name, nothing registers; another name still does', () => {
    const { text } = emitClient(
      bus(
        '  function alta(p: number) {}\n  function baja(p: number) {}\n  const xs = [alta];',
        '@foreach (const alta of xs) {\n      <div bus:alta=@alta bus:baja=@baja></div>\n    }\n' +
          '    @for (let baja = 0; baja < 1; baja++) {\n      <i bus:baja=@baja></i>\n    }',
      ),
    );
    expect(entries(text)).toEqual(['"x.fud#0": readonly ["baja", $BusParam<typeof baja>]']);
  });

  it('inside an @if the top level is still in reach, and after it too', () => {
    const { text } = emitClient(
      bus(
        '  function alta(p: number) {}\n  const on = true;',
        '@if (on) {\n      <div bus:alta=@alta></div>\n    }\n    <p bus:alta=@alta></p>',
      ),
    );
    expect(entries(text)).toHaveLength(2);
  });

  it('a caller that gives the AST but not the top-level names registers nothing', () => {
    const source = bus('  function alta(p: number) {}', '<div bus:alta=@alta></div>');
    const full = emitClient(source);
    // An AST that knows no fragment: without `topLevel`, no name is taken for a top-level one.
    const ast = (): undefined => undefined;
    const { text } = emitClientVirtual(source, 'x.fud', parseFud(source), registryOf({}), undefined, { ast });
    expect(entries(full.text)).toHaveLength(1);
    expect(entries(text)).toEqual([]);
  });

  it('inside a snippet nothing registers: its parameters are not known at the end of the module', () => {
    const { text } = emitClient(
      bus('  function alta(p: number) {}', '<p bus:alta=@alta></p>', '@snippet card() { <div bus:alta=@alta></div> }\n'),
    );
    expect(entries(text)).toEqual(['"x.fud#0": readonly ["alta", $BusParam<typeof alta>]']);
  });
});
