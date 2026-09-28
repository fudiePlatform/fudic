/**
 * SDD-40 §4.7 and BUG-44 §3.1 — the types the projection gives a route's `layout(ctx, data)`.
 *
 * The RETURN type is about where the error lands. The fact is TypeScript's, and a check written
 * as a synthetic assignment would report on the synthetic assignment — which maps to nothing the
 * author can see. Annotating the author's own function puts `TS2739` on the author's own
 * `return`, which is what the acceptance corpus then measures against the real checker.
 *
 * The PARAMETER types are about what the author can write at all: `ctx` left untyped is `any`,
 * and `any` autocompletes nothing.
 */

import { describe, expect, it } from 'vitest';
import { JsBatch } from '@fudic/compiler';
import { emitVirtualFiles } from '../src/emit.js';
import { emitServerVirtual } from '../src/emit-server.js';
import {
  exportsLoad,
  exportsLoadInText,
  findLayoutResolver,
  findLayoutResolverInText,
  type LayoutResolver,
} from '../src/layout-resolver.js';
import { parseFud, registryOf, statementsOf } from './_support.js';

const LAYOUT_LINK = '<link rel="layout" href="./_layout.fud">';

/** A route with the given `@server` body, and the server virtual it projects to. */
function serverVirtual(server: string, link = LAYOUT_LINK, fileName = 'blog/[slug].fud'): string {
  const source = `${link}\n@code {\n  @server {\n${server}\n  }\n}\n<h1>hola</h1>\n`;
  const files = emitVirtualFiles({
    source,
    fileName,
    document: parseFud(source),
    registry: registryOf({}, './_layout.fud'),
  });
  return files.find((f) => f.fileName.endsWith('.server.ts'))!.text;
}

const ANNOTATION = ': $LayoutProps';
const ASYNC_ANNOTATION = ': Promise<$LayoutProps>';
const CTX = `: $LayoutContext<'slug'>`;
const NO_LOAD = ': Record<string, never>';
const WITH_LOAD = ': Awaited<ReturnType<typeof load>>';
const IMPORT = `import type { $Props as $LayoutProps } from './_layout.fud';`;
/** What the resolver's `ctx` no longer carries: `load` injects, and hands it over in `data`. */
const INJECT = '$LayoutInject';

describe('the return type is spliced into the author’s own function', () => {
  it('annotates a `function` declaration, just past its `)`', () => {
    const out = serverVirtual('    export function layout(ctx, data) { return {}; }');
    expect(out).toContain(IMPORT);
    expect(out).toContain(`export function layout(ctx${CTX}, data${NO_LOAD})${ANNOTATION} { return {}; }`);
  });

  it('annotates an arrow, where «before the body» would land after the `=>`', () => {
    const out = serverVirtual('    export const layout = (ctx, data) => ({ culture: "es" });');
    expect(out).toContain(
      `export const layout = (ctx${CTX}, data${NO_LOAD})${ANNOTATION} => ({ culture: "es" });`,
    );
  });

  it('annotates a function expression too', () => {
    const out = serverVirtual('    export const layout = function (ctx, data) { return {}; };');
    expect(out).toContain(`= function (ctx${CTX}, data${NO_LOAD})${ANNOTATION} {`);
  });

  it('gives an `async` resolver a promise, and a plain one the props alone — never the union', () => {
    // The union is the contextual type of `return { }`, and completion would list `then`,
    // `catch` and `finally` beside the props (BUG-44 §2.3).
    const plain = serverVirtual('    export function layout(ctx, data) { return {}; }');
    const awaited = serverVirtual('    export async function layout(ctx, data) { return {}; }');
    const arrow = serverVirtual('    export const layout = async (ctx, data) => ({});');
    expect(plain).not.toContain('Promise<$LayoutProps>');
    expect(awaited).toContain(`export async function layout(ctx${CTX}, data${NO_LOAD})${ASYNC_ANNOTATION} {`);
    expect(arrow).toContain(`= async (ctx${CTX}, data${NO_LOAD})${ASYNC_ANNOTATION} =>`);
    expect(`${plain}${awaited}${arrow}`).not.toContain('| Promise');
  });

  it('leaves a return type the author wrote exactly as written, and still types the parameters', () => {
    const out = serverVirtual('    export function layout(ctx, data): { a: 1 } { return { a: 1 }; }');
    expect(out).not.toContain('$LayoutProps');
    expect(out).toContain(`export function layout(ctx${CTX}, data${NO_LOAD}): { a: 1 } { return { a: 1 }; }`);
  });

  it('does not annotate a resolver that takes nothing', () => {
    // A resolver with neither the context nor the data is not one the author has finished
    // writing, and there is no parameter list to hang the annotation past.
    const out = serverVirtual('    export function layout() { return {}; }');
    expect(out).not.toContain('$LayoutProps');
    expect(out).not.toContain(INJECT);
  });

  it('ignores a `layout` that is not a function', () => {
    expect(serverVirtual('    export const layout = 1;')).not.toContain('$LayoutProps');
  });

  it('ignores a `layout` nobody exports: it is somebody’s helper', () => {
    expect(serverVirtual('    function layout(ctx, data) { return {}; }')).not.toContain(
      '$LayoutProps',
    );
  });

  it('ignores an export with no declaration of its own', () => {
    const out = serverVirtual('    const other = 1;\n    export { other };');
    expect(out).not.toContain('$LayoutProps');
  });

  it('ignores another export beside it, and finds `layout` among them', () => {
    const out = serverVirtual(
      '    export function load(ctx) { return {}; }\n' +
        '    export function layout(ctx, data) { return {}; }',
    );
    expect(out).toContain(`export function layout(ctx${CTX}, data${WITH_LOAD})${ANNOTATION}`);
    expect(out).toContain('export function load(ctx) { return {}; }');
  });

  it('ignores a `layout` with no initialiser at all', () => {
    // Half typed. There is no function to annotate.
    expect(serverVirtual('    export let layout;')).not.toContain('$LayoutProps');
  });

  it('walks past an export that declares neither a function nor a binding', () => {
    const out = serverVirtual(
      '    export type Shape = { a: 1 };\n' +
        '    export class Helper {}\n' +
        '    export function layout(ctx, data) { return {}; }',
    );
    expect(out).toContain(`export function layout(ctx${CTX}, data${NO_LOAD})${ANNOTATION}`);
  });

  it('finds it among the declarators of one `export const`', () => {
    const out = serverVirtual('    export const other = 1, layout = (ctx, data) => ({});');
    expect(out).toContain(`layout = (ctx${CTX}, data${NO_LOAD})${ANNOTATION} => ({})`);
  });
});

describe('ctx and data get the types the runtime hands over (BUG-44 §3.1)', () => {
  it('reads the params off the route’s file name, and a route with none gets `never`', () => {
    const src = '    export function layout(ctx, data) { return {}; }';
    expect(serverVirtual(src, LAYOUT_LINK, 'routes/[lang]/[id].fud')).toContain(
      `ctx: $LayoutContext<'lang' | 'id'>,`,
    );
    expect(serverVirtual(src, LAYOUT_LINK, 'about.fud')).toContain('ctx: $LayoutContext<never>,');
  });

  it('types `data` with what `load` returns, whether `load` is a function or an arrow', () => {
    const fn = serverVirtual(
      '    export async function load() { return { a: 1 }; }\n' +
        '    export function layout(ctx, data) { return {}; }',
    );
    const arrow = serverVirtual(
      '    export const load = () => ({ a: 1 });\n' +
        '    export function layout(ctx, data) { return {}; }',
    );
    expect(fn).toContain(`data${WITH_LOAD}`);
    expect(arrow).toContain(`data${WITH_LOAD}`);
  });

  it('gives `ctx` no container: a service is `load`’s to inject, and arrives in `data`', () => {
    const bare = serverVirtual('    export function layout(ctx, data) { return {}; }');
    const typed = serverVirtual('    export function layout(ctx: unknown, data) { return {}; }');
    expect(bare).not.toContain(INJECT);
    expect(bare).not.toContain('@fudic/di');
    expect(typed).toContain(`layout(ctx: unknown, data${NO_LOAD})${ANNOTATION}`);
  });

  it('imports `$LayoutProps` only when the return is the projection’s to type', () => {
    const typed = serverVirtual('    export function layout(ctx, data): object { return {}; }');
    expect(typed).not.toContain(IMPORT);
    expect(typed).toContain(`layout(ctx${CTX}, data${NO_LOAD}): object`);
  });

  it('types a destructured context and an array pattern, and leaves a default or a rest alone', () => {
    expect(serverVirtual('    export function layout({ params }, [a]) { return {}; }')).toContain(
      `layout({ params }${CTX}, [a]${NO_LOAD})${ANNOTATION}`,
    );
    expect(serverVirtual('    export function layout(ctx = {}, ...rest) { return {}; }')).toContain(
      `layout(ctx = {}, ...rest)${ANNOTATION}`,
    );
  });

  it('types a resolver of one parameter, with no `data` to give a type to', () => {
    expect(serverVirtual('    export function layout(ctx) { return {}; }')).toContain(
      `layout(ctx${CTX})${ANNOTATION}`,
    );
  });

  it('leaves an optional parameter alone: `ctx?` is not what the runtime hands over', () => {
    expect(serverVirtual('    export function layout(ctx?, data?) { return {}; }')).toContain(
      `layout(ctx?, data?)${ANNOTATION}`,
    );
  });
});

describe('while the author is typing — the region does not parse (criterion 2)', () => {
  it('keeps the three types with `ctx.` half written', () => {
    const out = serverVirtual(
      '    export function layout(ctx, data) {\n      ctx.\n      return {};\n    }',
    );
    expect(out).toContain(IMPORT);
    expect(out).toContain(`export function layout(ctx${CTX}, data${NO_LOAD})${ANNOTATION} {`);
  });

  it('keeps the type of `data` too when `load` sits beside it', () => {
    const out = serverVirtual(
      '    export async function load() { return { a: 1 }; }\n' +
        '    export function layout(ctx, data) {\n      ctx.\n    }',
    );
    expect(out).toContain(`data${WITH_LOAD})${ANNOTATION}`);
  });

  it('types the resolver when the caller registered no `@server` fragments at all', () => {
    // Without the ids there is no AST to look in; the text of the region still says where the
    // resolver is, which is the same path a half-written `ctx.` takes.
    const source = `${LAYOUT_LINK}\n@code {\n  @server {\n    export function layout(ctx, data) { return {}; }\n  }\n}\n<h1>hola</h1>\n`;
    const document = parseFud(source);
    const files = emitVirtualFiles({
      source,
      fileName: 'blog/[slug].fud',
      document,
      registry: registryOf({}, './_layout.fud'),
      js: { result: new JsBatch(source).parse().value, neutral: [] },
    });
    expect(files.find((f) => f.fileName.endsWith('.server.ts'))!.text).toContain(
      `export function layout(ctx${CTX}, data${NO_LOAD})${ANNOTATION} {`,
    );
  });

  it('says nothing when the region has no resolver even as text', () => {
    const out = serverVirtual('    export function load() {\n      ctx.\n    }');
    expect(out).not.toContain('$LayoutProps');
    expect(out).not.toContain(INJECT);
  });
});

describe('emitServerVirtual — where the splices go', () => {
  it('splices only into the region that holds the resolver, with a second `@server` beside it', () => {
    // Two `@server` regions are `FUD0194`, but the editor still projects both.
    const source =
      `${LAYOUT_LINK}\n@code {\n  @server {\n    export const a = 1;\n  }\n` +
      `  @server {\n    export function layout(ctx, data) { return {}; }\n  }\n}\n<h1>hola</h1>\n`;
    const out = emitVirtualFiles({
      source,
      fileName: 'blog/[slug].fud',
      document: parseFud(source),
      registry: registryOf({}, './_layout.fud'),
    }).find((f) => f.fileName.endsWith('.server.ts'))!.text;
    expect(out).toContain('export const a = 1;');
    expect(out).toContain(`export function layout(ctx${CTX}, data${NO_LOAD})${ANNOTATION} {`);
  });

  it('copies the regions untouched for a contract that found no resolver', () => {
    const source = `${LAYOUT_LINK}\n@code {\n  @server {\n    export function layout(ctx) {}\n  }\n}\n`;
    const out = emitServerVirtual(source, 'x.fud', parseFud(source).code, {
      href: './_layout.fud',
      resolver: undefined,
      params: [],
      hasLoad: false,
    });
    expect(out.text).toContain('export function layout(ctx) {}');
    expect(out.text).not.toContain('$Layout');
  });
});

describe('only a route has a layout to check against', () => {
  it('says nothing for a file whose `<link rel="layout">` has no href', () => {
    const out = serverVirtual('    export function layout(ctx, data) { return {}; }', '<link rel="layout">');
    expect(out).not.toContain('$LayoutProps');
  });

  it('says nothing for a component, which has no layout at all', () => {
    const source =
      '@code {\n  @server {\n    export function layout(ctx, data) { return {}; }\n  }\n}\n' +
      '<app-x><template shadowrootmode="open"><p>hi</p></template></app-x>\n';
    const files = emitVirtualFiles({
      source,
      fileName: 'app-x.fud',
      document: parseFud(source),
      registry: registryOf({}),
    });
    expect(files.find((f) => f.fileName.endsWith('.server.ts'))!.text).not.toContain(
      '$LayoutProps',
    );
  });
});

/** The text a resolver's points name, read back: what lies just BEFORE each point. */
function before(source: string, at: number | undefined): string | undefined {
  return at === undefined ? undefined : source.slice(0, at);
}

describe('findLayoutResolver — over the AST', () => {
  function find(code: string): { source: string; found: LayoutResolver | undefined } {
    const { statements, mapSpan } = statementsOf(code, { start: 0, end: code.length });
    return { source: code, found: findLayoutResolver(code, statements, mapSpan) };
  }

  it('puts `ctxAt` and `dataAt` just past each name, in a function and in an arrow', () => {
    for (const code of [
      'export function layout(ctx, data) { return {}; }',
      'export const layout = (ctx, data) => ({});',
    ]) {
      const { source, found } = find(code);
      expect(before(source, found?.ctxAt)).toMatch(/\(ctx$/u);
      expect(before(source, found?.dataAt)).toMatch(/, data$/u);
      expect(before(source, found?.annotateAt)).toMatch(/data\)$/u);
      expect(found?.async).toBe(false);
    }
  });

  it('says `async` for an `async` resolver', () => {
    expect(find('export async function layout(ctx) { return {}; }').found?.async).toBe(true);
  });

  it('leaves a typed parameter and a typed return out of the points', () => {
    const { found } = find('export function layout(ctx: X, data): Y { return {}; }');
    expect(found).toEqual({ async: false, dataAt: expect.any(Number) });
  });
});

describe('exportsLoad', () => {
  const loads = (code: string): boolean =>
    exportsLoad(statementsOf(code, { start: 0, end: code.length }).statements);

  it('sees a `load` function and a `load` arrow, and nothing else', () => {
    expect(loads('export async function load() { return {}; }')).toBe(true);
    expect(loads('export const load = () => ({});')).toBe(true);
    expect(loads('export const load = 1;')).toBe(false);
    expect(loads('export function paths() { return []; }')).toBe(false);
  });
});

describe('findLayoutResolverInText — the plan B, over the text', () => {
  function find(code: string, prefix = 'x'): { source: string; found: LayoutResolver | undefined } {
    // A prefix outside the region, so an offset computed against the region alone shows.
    const source = `${prefix}${code}`;
    return {
      source,
      found: findLayoutResolverInText(source, { start: prefix.length, end: source.length }),
    };
  }

  it('finds a half-written resolver and lands each point just past its name', () => {
    const { source, found } = find('export function layout(ctx, data) {\n  ctx.\n}');
    expect(before(source, found?.ctxAt)).toMatch(/\(ctx$/u);
    expect(before(source, found?.dataAt)).toMatch(/, data$/u);
    expect(before(source, found?.annotateAt)).toMatch(/data\)$/u);
    expect(found?.async).toBe(false);
  });

  it('lands the points right with the whitespace people write around a name', () => {
    const { source, found } = find('export function layout( ctx ,  data ) {');
    expect(before(source, found?.ctxAt)).toMatch(/\( ctx$/u);
    expect(before(source, found?.dataAt)).toMatch(/,  data$/u);
    expect(before(source, found?.annotateAt)).toMatch(/data \)$/u);
  });

  it('reads `async` off both shapes', () => {
    expect(find('export async function layout(ctx) {').found?.async).toBe(true);
    expect(find('export const layout = async (ctx) => {').found?.async).toBe(true);
    expect(find('export const layout = (ctx) => {').found?.async).toBe(false);
  });

  it('gives no points for an empty parameter list', () => {
    expect(find('export function layout() {').found).toBeUndefined();
    expect(find('export function layout(  ) {').found).toBeUndefined();
  });

  it('types only the bare names, and leaves a typed return alone', () => {
    const { found } = find('export function layout(ctx: X, data): Y {');
    expect(found).toEqual({ async: false, dataAt: expect.any(Number) });
  });

  it('gives a one-parameter resolver no `dataAt`', () => {
    const { found } = find('export function layout(ctx) {');
    expect(found?.dataAt).toBeUndefined();
    expect(found?.ctxAt).toBeDefined();
  });

  it('says nothing for a region with no `layout` export', () => {
    expect(find('export function load(ctx) {').found).toBeUndefined();
    expect(find('function layout(ctx) {').found).toBeUndefined();
  });
});

describe('exportsLoadInText', () => {
  const loads = (code: string): boolean =>
    exportsLoadInText(`x${code}`, { start: 1, end: code.length + 1 });

  it('sees every way of exporting `load`, and nothing else', () => {
    expect(loads('export function load() {')).toBe(true);
    expect(loads('export async function load() {')).toBe(true);
    expect(loads('export const load = (')).toBe(true);
    expect(loads('export function loader() {')).toBe(false);
    expect(loads('function load() {')).toBe(false);
  });
});
