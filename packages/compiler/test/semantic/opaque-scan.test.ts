/**
 * BUG-30 — a marker written inside a JS comment, string, template or regex is not a marker,
 * and a `load` named in one is not an export.
 *
 * The two rules that scan a `@code` region's TEXT — `code-region-nesting` (FUD0193) and
 * `layout-load` (FUD0430) — used to match on the raw substring, so prose about a region was
 * an error about a region. What they must keep catching is every REAL case, at the very same
 * offset: the fix masks, it does not move anything.
 */

import { describe, expect, it } from 'vitest';
import { parseDocument, type AtConstructParser } from '../../src/html/index.js';
import { parseControl } from '../../src/control/index.js';
import { parseCodeBlock } from '../../src/code/index.js';
import { parseDirective } from '../../src/layout/index.js';
import { structureDocument } from '../../src/document/index.js';
import { JsBatch } from '../../src/oxc/index.js';
import type { Diagnostic } from '../../src/types/index.js';
import { analyze, type SemanticInput } from '../../src/semantic/index.js';

const constructs: AtConstructParser = { parseControl, parseCodeBlock, parseDirective };

function diags(source: string): readonly Diagnostic[] {
  const html = parseDocument(source, { atConstructs: constructs }).value;
  const document = structureDocument(source, html).value;
  const js = new JsBatch(source).parse().value;
  const input: SemanticInput = {
    source,
    document,
    js,
    fragmentId: () => undefined,
    components: { has: () => false },
  };
  return analyze(input).diagnostics;
}

const codes = (source: string): readonly string[] => diags(source).map((d) => d.code);

/** Prefix a `@code` block to a minimal component (SDD-10's link→code→head→host order). */
const withCode = (code: string): string =>
  `${code}<app-test><template shadowrootmode="open"></template></app-test>`;

/** The same block inside a layout, where FUD0430 applies. */
const layout = (code: string): string =>
  `<!DOCTYPE html><html><head>${code}@RenderHead()</head><body>@RenderBody()</body></html>`;

describe('FUD0193 — a marker inside an opaque region is prose, not a region (§6.1–6.2)', () => {
  it('ignores a line comment that names a region, in the neutral zone', () => {
    // The comment the bug was reported with, verbatim in spirit: the natural place to say
    // why a constant does NOT live in the client region is right above the constant.
    const source = withCode(
      '@code {\n  // Written inside @client, the route prerender fails.\n  const count = 1;\n}',
    );
    expect(codes(source)).not.toContain('FUD0193');
    expect(codes(withCode('@code { // TODO: move this to @client\nconst a = 1; }'))).not.toContain(
      'FUD0193',
    );
  });

  it('ignores a block comment, a string, a template and a regex literal', () => {
    expect(codes(withCode('@code { /* move to @server one day */ const a = 1; }'))).not.toContain(
      'FUD0193',
    );
    expect(codes(withCode('@code { const s = "@server"; }'))).not.toContain('FUD0193');
    expect(codes(withCode('@code { const t = `usa @client aquí`; }'))).not.toContain('FUD0193');
    expect(codes(withCode('@code { const re = /@client/u; }'))).not.toContain('FUD0193');
  });

  it('ignores a comment written INSIDE a real region — the one explaining the region', () => {
    expect(
      codes(withCode('@code { @client {\n  // this @client block owns the counter\n  let n = 0;\n} }')),
    ).not.toContain('FUD0193');
    expect(
      codes(withCode('@code { @server {\n  const doc = "runs in @server only";\n} }')),
    ).not.toContain('FUD0193');
  });

  it('ignores a marker inside a template interpolation string (nested opaque regions)', () => {
    expect(codes(withCode('@code { const t = `x ${"@server"} y`; }'))).not.toContain('FUD0193');
  });

  it('still flags a region nested in a region, with the span on the marker (§6.4)', () => {
    const source = withCode('@code { @client { @server {} } }');
    const found = diags(source).filter((d) => d.code === 'FUD0193');
    expect(found).toHaveLength(1);
    expect(source.slice(found[0]!.span.start, found[0]!.span.end)).toBe('@server');
    // The offset is the one the raw text scan produced: masking never moves a span (§6.7).
    expect(found[0]!.span.start).toBe(source.indexOf('@server'));
  });

  it('still flags a marker in the neutral zone at brace depth > 0 (§6.5)', () => {
    const source = withCode('@code { function f() { @client { } } }');
    const found = diags(source).filter((d) => d.code === 'FUD0193');
    expect(found).toHaveLength(1);
    expect(source.slice(found[0]!.span.start, found[0]!.span.end)).toBe('@client');
  });
});

describe('FUD0430 — a `load` named in prose is not an export (§6.3, §6.6)', () => {
  it('ignores a comment and a string that mention exporting load', () => {
    expect(
      codes(
        layout(
          '@code { @server {\n  // A layout cannot export function load: it receives the route data.\n  const T = "Blog";\n} }',
        ),
      ),
    ).not.toContain('FUD0430');
    expect(
      codes(layout('@code { @server { const doc = "export function load"; } }')),
    ).not.toContain('FUD0430');
    expect(
      codes(layout('@code { @server { /* export const load = … */ const T = 1; } }')),
    ).not.toContain('FUD0430');
  });

  it('still flags a real exported load, with the span of the region (§6.6, §6.7)', () => {
    const fn = layout('@code { @server { export async function load() { return {}; } } }');
    const onFn = diags(fn).filter((d) => d.code === 'FUD0430');
    expect(onFn).toHaveLength(1);
    expect(fn.slice(onFn[0]!.span.start, onFn[0]!.span.end)).toBe(
      '@server { export async function load() { return {}; } }',
    );

    const konst = layout('@code { @server { export const load = () => ({}); } }');
    expect(codes(konst)).toContain('FUD0430');
  });

  it('still flags a real load written after a comment that mentions it', () => {
    const source = layout(
      '@code { @server {\n  // load lives here, and that is the bug\n  export const load = () => ({});\n} }',
    );
    expect(codes(source)).toContain('FUD0430');
  });
});
