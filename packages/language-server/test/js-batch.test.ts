/**
 * The single Oxc invocation per document (SDD-24 §4.5).
 *
 * What is asserted is not "it parses" but WHO gets to see the result: the neutral chunks for
 * the emitter of SDD-23, the regions for the `$` rule, and a fragment id per node for the
 * semantic pass of SDD-12. One batch, three consumers.
 */

import { describe, expect, it } from 'vitest';
import { documentRoots, walk, type Node, type RazorExpression } from '@fudic/compiler';
import { batchDocumentJs } from '../src/js-batch.js';
import { parseFud } from '../src/parse.js';
import { component } from './_support.js';

const WITH_CODE = `@code {
  type Tone = 'neutral' | 'info';

  const { tone = 'neutral' } = props<{ tone?: Tone }>();

  @server {
    export async function load(): Promise<{ n: number }> {
      return { n: 1 };
    }
  }

  @client {
    const label = 'hi';
  }
}

<app-badge>
  <template shadowrootmode="open">
    <span>@tone</span>
  </template>
</app-badge>
`;

const parse = (source: string) => {
  const { document } = parseFud(source);
  return { document, js: batchDocumentJs(source, document) };
};

/** The first content-level interpolation of a document. */
function firstInterpolation(document: ReturnType<typeof parse>['document']): RazorExpression {
  let found: RazorExpression | undefined;
  walk(documentRoots(document), {
    interpolation(expr) {
      found ??= expr;
    },
  });
  return found as RazorExpression;
}

describe('batchDocumentJs', () => {
  it('registers the neutral chunks the emitter looks for props<T>() in', () => {
    const { js } = parse(WITH_CODE);

    expect(js.neutral.length).toBeGreaterThan(0);
    for (const id of js.neutral) {
      expect(js.result.ast(id)).toBeDefined();
    }
  });

  it('registers the @server and @client regions the $ rule needs', () => {
    const { js } = parse(WITH_CODE);

    expect(js.regions.map((region) => region.part.type).sort()).toEqual([
      'client-region',
      'server-region',
    ]);
  });

  it('answers a fragment id per JS-bearing node, and nothing for the rest', () => {
    const { document, js } = parse(WITH_CODE);
    const interpolation = firstInterpolation(document);
    const part = document.code?.parts[0] as Node;

    expect(js.fragmentId(interpolation)).toBeTypeOf('number');
    expect(js.fragmentId(part)).toBeTypeOf('number');
    expect(js.fragmentId({ type: 'element', span: { start: 0, end: 1 } } as Node)).toBeUndefined();
  });

  it('has nothing to register in a document without @code', () => {
    const { js } = parse(component('app-badge'));

    expect(js.neutral).toEqual([]);
    expect(js.regions).toEqual([]);
    expect(js.diagnostics).toEqual([]);
  });

  it('reports a syntax error as a diagnostic over the .fud, not as a throw', () => {
    const source = `@code {\n  @client {\n    const = ;\n  }\n}\n${component('app-badge')}`;
    const { js } = parse(source);

    expect(js.diagnostics.length).toBeGreaterThan(0);
    const [first] = js.diagnostics;
    expect(first?.code).toBe('FUD0170');
    expect(source.slice(first?.span.start ?? 0, first?.span.end ?? 0)).toBeDefined();
    expect(first?.span.end).toBeLessThanOrEqual(source.length);
  });
});
