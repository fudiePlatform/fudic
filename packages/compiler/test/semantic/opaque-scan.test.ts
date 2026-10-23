/**
 * BUG-30 — a marker written inside a JS comment, string, template or regex is not a marker,
 * and a `load` named in one is not an export.
 *
 * The rule that scans a `@code`'s TEXT — `layout-load` (FUD0430) — used to match on the
 * raw substring, so prose about a region was an error about a region. (`code-region-nesting`,
 * FUD0193, scanned it too, until SDD-60 retired it with the regions.) What it must keep
 * catching is every REAL case, at the very same offset: the fix masks, it does not move anything.
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

describe('FUD0430 — a `load` named in prose is not an export (§6.3, §6.6)', () => {
  it('ignores a comment and a string that mention exporting load', () => {
    expect(
      codes(
        layout(
          '@code {\n  // A layout cannot export function load: it receives the route data.\n  const T = "Blog";\n}',
        ),
      ),
    ).not.toContain('FUD0430');
    expect(
      codes(layout('@code { const doc = "export function load"; }')),
    ).not.toContain('FUD0430');
    expect(
      codes(layout('@code { /* export const load = … */ const T = 1; }')),
    ).not.toContain('FUD0430');
  });

  it('still flags a real exported load, with the span of the export (§6.6, §6.7)', () => {
    const fn = layout('@code { export async function load() { return {}; } }');
    const onFn = diags(fn).filter((d) => d.code === 'FUD0430');
    expect(onFn).toHaveLength(1);
    expect(fn.slice(onFn[0]!.span.start, onFn[0]!.span.end)).toBe(
      'export async function load',
    );

    const konst = layout('@code { export const load = () => ({}); }');
    expect(codes(konst)).toContain('FUD0430');
  });

  it('still flags a real load written after a comment that mentions it', () => {
    const source = layout(
      '@code {\n  // load lives here, and that is the bug\n  export const load = () => ({});\n}',
    );
    expect(codes(source)).toContain('FUD0430');
  });
});
