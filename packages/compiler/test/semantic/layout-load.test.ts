/**
 * SDD-21 §6.13 (decision 89) — a layout does not load data in v1: it receives the route's
 * `data` read-only. The rule is semantic (it is about what the `@server` region exports),
 * so it lives in the SDD-12 pass as one more analyzer.
 */

import { describe, expect, it } from 'vitest';
import { parseDocument, type AtConstructParser } from '../../src/html/index.js';
import { parseControl } from '../../src/control/index.js';
import { parseCodeBlock } from '../../src/code/index.js';
import { parseDirective } from '../../src/layout/index.js';
import { structureDocument } from '../../src/document/index.js';
import { JsBatch } from '../../src/oxc/index.js';
import { analyze, type SemanticInput } from '../../src/semantic/index.js';

const constructs: AtConstructParser = { parseControl, parseCodeBlock, parseDirective };

function codes(source: string): readonly string[] {
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
  return analyze(input).diagnostics.map((d) => d.code);
}

const layout = (code: string): string =>
  `<!DOCTYPE html><html><head>${code}@RenderHead()</head><body>@RenderBody()</body></html>`;

describe('layout-load — FUD0430 (decision 89)', () => {
  it('rejects an exported load in a layout, in any binding form', () => {
    expect(codes(layout('@code { @server { export async function load() { return {}; } } }'))).toContain('FUD0430');
    expect(codes(layout('@code { @server { export const load = () => ({}); } }'))).toContain('FUD0430');
  });

  it('allows a layout with @code that does not load', () => {
    expect(codes(layout('@code { @server { const TITLE = "x"; } }'))).not.toContain('FUD0430');
    expect(codes(layout('@code { @client { let open = false; } }'))).not.toContain('FUD0430');
    expect(codes(layout(''))).not.toContain('FUD0430');
  });

  it('leaves a route free to export load — that is where data belongs', () => {
    const route =
      '<link rel="layout" href="./l.fud">@code { @server { export async function load() { return {}; } } }<p>x</p>';
    expect(codes(route)).not.toContain('FUD0430');
  });
});
