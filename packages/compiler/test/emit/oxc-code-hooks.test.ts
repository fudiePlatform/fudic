/**
 * SDD-86 task 2 — the hooks a `@code` uses, read from the Oxc AST like `props`, in
 * `ExtractedCode.hooks` (each call: its kind, the span of the call and of its name, and
 * whether it is a statement at the top level) and `ExtractedCode.hookShadows` (each
 * declaration or import named like a hook). For components, routes, pages and layouts.
 */
import { describe, expect, it } from 'vitest';
import { extractCode, type CodeDocument, type ExtractedCode } from '../../src/emit/oxc-code.js';
import { parse } from './_support.js';

const component = (code: string): string =>
  `@code {\n${code}\n}\n<m-el>\n  <template shadowrootmode="open"><span></span></template>\n</m-el>\n`;
const route = (code: string): string => `<link rel="layout" href="./_l.fud">\n@code {\n${code}\n}\n<p>x</p>\n`;
const page = (code: string): string =>
  `<!DOCTYPE html>\n<html>\n<head>\n@code {\n${code}\n}\n<title>t</title>\n</head>\n<body><p>x</p></body>\n</html>\n`;
const layout = (code: string): string =>
  `<!DOCTYPE html>\n<html>\n<head>\n@code {\n${code}\n}\n@RenderHead()\n</head>\n<body><main>@RenderBody()</main></body>\n</html>\n`;

function extract(source: string): ExtractedCode {
  return extractCode(source, parse(source) as CodeDocument);
}

/** Every hook use as `kind|call text|callee text|top`, in source order. */
function uses(source: string): string[] {
  return extract(source).hooks.map(
    (h) =>
      `${h.kind}|${source.slice(h.span.start, h.span.end)}|${source.slice(h.callee.start, h.callee.end)}|${h.topLevel ? 'top' : 'nested'}`,
  );
}

function shadows(source: string): string[] {
  return extract(source).hookShadows.map((s) => `${s.name}|${source.slice(s.span.start, s.span.end)}`);
}

describe('ExtractedCode.hooks', () => {
  it('a file with no hooks has an empty list — and so does one with no @code', () => {
    expect(extract(component('const a = 1;')).hooks).toEqual([]);
    const bare = '<m-el>\n  <template shadowrootmode="open"><span></span></template>\n</m-el>\n';
    expect(extract(bare).hooks).toEqual([]);
    expect(extract(bare).hookShadows).toEqual([]);
  });

  it('the seven, in source order, with the call and the name in source coordinates', () => {
    const code = [
      'onDispose((h) => {});',
      'beforeHydrate((h) => {});',
      'afterHydrate((h) => {});',
      'beforeCreate((h) => {});',
      'afterCreate((h) => {});',
      'onConnect((h) => () => {});',
      'onDisconnect((h) => {});',
    ].join('\n');
    expect(uses(component(code))).toEqual([
      'onDispose|onDispose((h) => {})|onDispose|top',
      'beforeHydrate|beforeHydrate((h) => {})|beforeHydrate|top',
      'afterHydrate|afterHydrate((h) => {})|afterHydrate|top',
      'beforeCreate|beforeCreate((h) => {})|beforeCreate|top',
      'afterCreate|afterCreate((h) => {})|afterCreate|top',
      'onConnect|onConnect((h) => () => {})|onConnect|top',
      'onDisconnect|onDisconnect((h) => {})|onDisconnect|top',
    ]);
  });

  it('nested calls are listed too, marked as not top level, in source order', () => {
    const code = 'afterHydrate(() => {\n  onConnect(() => {});\n});\nfunction f() { onDispose(() => {}); }';
    expect(uses(component(code))).toEqual([
      'afterHydrate|afterHydrate(() => {\n  onConnect(() => {});\n})|afterHydrate|top',
      'onConnect|onConnect(() => {})|onConnect|nested',
      'onDispose|onDispose(() => {})|onDispose|nested',
    ]);
  });

  it('a top-level call that is part of a bigger expression is not top level', () => {
    expect(uses(component('const x = onConnect(() => {});'))).toEqual(['onConnect|onConnect(() => {})|onConnect|nested']);
    expect(uses(component('afterHydrate(a), afterHydrate(b);'))).toEqual([
      'afterHydrate|afterHydrate(a)|afterHydrate|nested',
      'afterHydrate|afterHydrate(b)|afterHydrate|nested',
    ]);
  });

  it('a member call or a computed callee is not a hook', () => {
    expect(uses(component("obj.afterHydrate(() => {});\nobj['onConnect']();\n(0, x)();"))).toEqual([]);
  });

  it('other calls are not hooks, whatever their argument', () => {
    expect(uses(component('props();\nsignal(0);\nhydrate(() => {});'))).toEqual([]);
  });

  it('in a route, a page and a layout', () => {
    for (const source of [route('afterHydrate(() => {});'), page('afterHydrate(() => {});'), layout('afterHydrate(() => {});')]) {
      expect(uses(source)).toEqual(['afterHydrate|afterHydrate(() => {})|afterHydrate|top']);
    }
  });
});

describe('ExtractedCode.hookShadows', () => {
  it('declarations and imports with a hook’s name, on the binding, in source order', () => {
    const code = [
      "import { onConnect } from './a';",
      "import afterCreate from './b';",
      "import * as beforeHydrate from './c';",
      "import { x as onDispose, afterHydrate as fine } from './d';",
      'const onDisconnect = 1;',
      'let { a: beforeCreate = 2, ...afterHydrate } = {};',
      'function onConnect2() {}',
    ].join('\n');
    expect(shadows(component(code))).toEqual([
      'onConnect|onConnect',
      'afterCreate|afterCreate',
      'beforeHydrate|beforeHydrate',
      'onDispose|onDispose',
      'onDisconnect|onDisconnect',
      'beforeCreate|beforeCreate',
      'afterHydrate|afterHydrate',
    ]);
  });

  it('functions, classes (declaration and expression), parameters and catch bindings', () => {
    const code = [
      'function onDispose(onConnect, { afterCreate } = {}) {}',
      'class beforeHydrate {}',
      'const K = class onDisconnect {};',
      'const g = ([afterHydrate]) => afterHydrate;',
      'const h = function beforeCreate() {};',
      'try {} catch ({ message: onConnect }) {}',
    ].join('\n');
    expect(shadows(component(code)).map((s) => s.split('|')[0])).toEqual([
      'onDispose',
      'onConnect',
      'afterCreate',
      'beforeHydrate',
      'onDisconnect',
      'afterHydrate',
      'beforeCreate',
      'onConnect',
    ]);
  });

  it('a hook called inside an initializer, a default or a catch body is still found', () => {
    const code = [
      'const a = () => afterHydrate(() => {});',
      'function f(x = onConnect(() => {})) {}',
      'try {} catch (e) { onDispose(() => {}); }',
    ].join('\n');
    expect(uses(component(code)).map((u) => u.split('|')[0])).toEqual(['afterHydrate', 'onConnect', 'onDispose']);
  });

  it('names that are not bindings are not shadows: keys, members, methods, a renamed import away', () => {
    const code = [
      'const o = { onConnect: 1, afterHydrate() {} };',
      'class C { onDispose() {} beforeCreate = 1; }',
      "import { onDisconnect as nope } from './x';",
      'o.onConnect;',
    ].join('\n');
    expect(shadows(component(code))).toEqual([]);
  });

  it('in a route and in a layout', () => {
    expect(shadows(route('const afterHydrate = 1;'))).toEqual(['afterHydrate|afterHydrate']);
    expect(shadows(layout('const onDispose = 1;'))).toEqual(['onDispose|onDispose']);
  });
});
