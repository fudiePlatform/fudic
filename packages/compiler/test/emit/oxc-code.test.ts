/**
 * `@code` extraction (Oxc) — the prop-default and inert-signal reading that feeds the
 * component module. Covers the shapes the home fixtures do not exercise (a prop with no
 * default, `signal()` with no initial, a non-{props,signal} declaration, rest/spread in
 * the pattern, and no `@code` at all), so the extraction's branches stay honest.
 */
import { describe, expect, it } from 'vitest';
import { extractCode } from '../../src/emit/oxc-code.js';
import type { ComponentDocument } from '../../src/document/index.js';
import { parse } from './_support.js';

const componentDoc = (source: string): ComponentDocument => {
  const doc = parse(source);
  if (doc.type !== 'component-document') throw new Error('expected a component document');
  return doc;
};

const wrap = (code: string): string =>
  `${code}<m-el>\n  <template shadowrootmode="open"><span></span></template>\n</m-el>\n`;

describe('extractCode', () => {
  it('reads props (with and without a default) and signals (with and without an initial)', () => {
    const source = wrap(
      '@code {\n' +
        '  const { a, b = 2 } = props<{ a: string; b: number }>();\n' +
        '  const s = signal();\n' +
        '  const t = signal(5);\n' +
        '  const helper = compute();\n' +
        '}\n',
    );
    const { props, signals } = extractCode(source, componentDoc(source));
    expect(props).toEqual([{ name: 'a' }, { name: 'b', def: '2' }]); // 'a' has no default
    expect(signals).toEqual([
      { name: 's', init: 'undefined' }, // signal() with no argument
      { name: 't', init: '5' },
    ]);
  });

  it('skips rest/spread in the props pattern', () => {
    const source = wrap('@code {\n  const { a, ...rest } = props<{ a: string }>();\n}\n');
    expect(extractCode(source, componentDoc(source)).props).toEqual([{ name: 'a' }]);
  });

  it('returns nothing for a component with no @code', () => {
    const source = '<m-el>\n  <template shadowrootmode="open"><span></span></template>\n</m-el>\n';
    expect(extractCode(source, componentDoc(source))).toEqual({ props: [], signals: [] });
  });
});
