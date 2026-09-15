/**
 * SDD-40 §4.7 — the return type the projection gives a route's `layout(ctx, data)`.
 *
 * What is at stake is where the error lands. The fact is TypeScript's, and a check written as
 * a synthetic assignment would report on the synthetic assignment — which maps to nothing the
 * author can see. Annotating the author's own function puts `TS2739` on the author's own
 * `return`, which is what the acceptance corpus then measures against the real checker.
 */

import { describe, expect, it } from 'vitest';
import { JsBatch } from '@fudic/compiler';
import { emitVirtualFiles } from '../src/emit.js';
import { parseFud, registryOf } from './_support.js';

const LAYOUT_LINK = '<link rel="layout" href="./_layout.fud">';

/** A route with the given `@server` body, and the server virtual it projects to. */
function serverVirtual(server: string, link = LAYOUT_LINK): string {
  const source = `${link}\n@code {\n  @server {\n${server}\n  }\n}\n<h1>hola</h1>\n`;
  const files = emitVirtualFiles({
    source,
    fileName: 'blog/[slug].fud',
    document: parseFud(source),
    registry: registryOf({}, './_layout.fud'),
  });
  return files.find((f) => f.fileName.endsWith('.server.ts'))!.text;
}

const ANNOTATION = ': $LayoutProps | Promise<$LayoutProps>';

describe('the return type is spliced into the author’s own function', () => {
  it('annotates a `function` declaration, just past its `)`', () => {
    const out = serverVirtual('    export function layout(ctx, data) { return {}; }');
    expect(out).toContain(`import type { $Props as $LayoutProps } from './_layout.fud';`);
    expect(out).toContain(`export function layout(ctx, data)${ANNOTATION} { return {}; }`);
  });

  it('annotates an arrow, where «before the body» would land after the `=>`', () => {
    const out = serverVirtual('    export const layout = (ctx, data) => ({ culture: "es" });');
    expect(out).toContain(`export const layout = (ctx, data)${ANNOTATION} => ({ culture: "es" });`);
  });

  it('annotates a function expression too', () => {
    const out = serverVirtual('    export const layout = function (ctx, data) { return {}; };');
    expect(out).toContain(`= function (ctx, data)${ANNOTATION} {`);
  });

  it('leaves a resolver that already declares its return type exactly as written', () => {
    const out = serverVirtual('    export function layout(ctx, data): { a: 1 } { return { a: 1 }; }');
    expect(out).not.toContain('$LayoutProps');
    expect(out).toContain('export function layout(ctx, data): { a: 1 } { return { a: 1 }; }');
  });

  it('does not annotate a resolver that takes nothing', () => {
    // A resolver with neither the context nor the data is not one the author has finished
    // writing, and there is no parameter list to hang the annotation past.
    const out = serverVirtual('    export function layout() { return {}; }');
    expect(out).not.toContain('$LayoutProps');
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
    expect(out).toContain(`export function layout(ctx, data)${ANNOTATION}`);
    expect(out).not.toContain(`export function load(ctx)${ANNOTATION}`);
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
    expect(out).toContain(`export function layout(ctx, data)${ANNOTATION}`);
  });

  it('finds it among the declarators of one `export const`', () => {
    const out = serverVirtual('    export const other = 1, layout = (ctx, data) => ({});');
    expect(out).toContain(`layout = (ctx, data)${ANNOTATION} => ({})`);
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

  it('says nothing when the caller registered no `@server` fragments', () => {
    // The emitter degrades rather than erroring: without the ids there is no AST to look in,
    // the resolver keeps the signature its author wrote, and the BUILD still says `FUD0702`.
    const source = `${LAYOUT_LINK}\n@code {\n  @server {\n    export function layout(ctx, data) { return {}; }\n  }\n}\n<h1>hola</h1>\n`;
    const document = parseFud(source);
    const files = emitVirtualFiles({
      source,
      fileName: 'blog/[slug].fud',
      document,
      registry: registryOf({}, './_layout.fud'),
      js: { result: new JsBatch(source).parse().value, neutral: [] },
    });
    expect(files.find((f) => f.fileName.endsWith('.server.ts'))!.text).not.toContain(
      '$LayoutProps',
    );
  });
});
