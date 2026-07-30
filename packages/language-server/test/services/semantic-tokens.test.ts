/**
 * Semantic tokens from the AST (SDD-24 §4.3).
 *
 * Asserted as (type, text) pairs: what matters is that the stretch coloured is exactly the
 * construct and not the body it encloses — the TextMate grammar of SDD-25 is allowed to be
 * approximate, this is not.
 */

import { describe, expect, it } from 'vitest';
import { DocumentCache } from '../../src/document-cache.js';
import { WorkspaceIndex } from '../../src/workspace-index.js';
import { keywordSpanAt, semanticTokens } from '../../src/services/semantic-tokens.js';
import { component, LAYOUT, memoryFs, route } from '../_support.js';

const RICH = `@code {
  const { tone = 'neutral' } = props<{ tone?: string }>();

  @server {
    export const secret = 1;
  }

  @client {
    const onClick = () => {};
  }
}

<link rel="component" href="./app-badge.fud">

<app-x>
  <template shadowrootmode="open">
    <div
      class="static"
      class:on="@(tone === 'x')"
      style:color="@tone"
      .value="@tone"
      @click="@onClick"
      ref="@root"
      bus:(tone)="@onClick"
    >
      @tone
      @raw(tone)
      @{ const inline = 1; }
      @if (tone) { <app-badge tone="a">@tone</app-badge> } else { <i>no</i> }
      @if (!tone) { <em>@tone</em> }
      @foreach (const t of [1]) { <b>@t</b> }
      @for (let i = 0; i < 2; i++) { <b>@i</b> }
      @while (false) { <b>x</b> }
      @switch (tone) { case 'a': <b>a</b> default: <b>d</b> }
    </div>
  </template>
</app-x>
`;

function tokensOf(path: string, source: string, extra: Readonly<Record<string, string>> = {}) {
  const files = {
    '/p/components/app-badge.fud': component('app-badge'),
    '/p/layouts/_layout.fud': LAYOUT,
    ...extra,
    [path]: source,
  };
  const index = new WorkspaceIndex(memoryFs(files));
  index.scan('/p');
  const document = new DocumentCache(index).get(path, 1, source);

  return semanticTokens(document).map(
    (token) => [token.type, source.slice(token.span.start, token.span.end)] as const,
  );
}

describe('keywordSpanAt', () => {
  it('takes the @ and the letters after it, and stops there', () => {
    const source = 'x @foreach (const a of b) { }';
    const at = source.indexOf('@');

    expect(source.slice(at, keywordSpanAt(source, at).end)).toBe('@foreach');
  });

  it('stops at the end of a half-typed file', () => {
    expect(keywordSpanAt('@if', 0)).toEqual({ start: 0, end: 3 });
  });
});

describe('semanticTokens', () => {
  const tokens = tokensOf('/p/components/app-x.fud', RICH);
  const of = (type: string) => tokens.filter(([kind]) => kind === type).map(([, text]) => text);

  it('marks @code and its two regions as directives', () => {
    expect(of('fudDirective')).toContain('@code');
    expect(of('fudDirective')).toContain('@server');
    expect(of('fudDirective')).toContain('@client');
  });

  it('marks every control keyword, and only the keyword', () => {
    for (const keyword of ['@if', '@foreach', '@for', '@while', '@switch']) {
      expect(of('fudDirective')).toContain(keyword);
    }
    expect(of('fudDirective')).toContain('@{');
  });

  it('marks interpolations, escaped and raw alike', () => {
    expect(of('fudInterpolation')).toContain('@tone');
    expect(of('fudInterpolation').some((text) => text.startsWith('@raw('))).toBe(true);
  });

  it('reaches inside every control body, else branch and switch case included', () => {
    // `@t` and `@i` only exist inside a loop body; `no` sits in the else branch.
    expect(of('fudInterpolation')).toContain('@t');
    expect(of('fudInterpolation')).toContain('@i');
  });

  it('marks the bindings by their name, never the value', () => {
    const bindings = of('fudBinding');

    expect(bindings).toContain('class:on');
    expect(bindings).toContain('style:color');
    expect(bindings).toContain('.value');
    expect(bindings).toContain('@click');
    expect(bindings).toContain('ref');
    expect(bindings.some((text) => text.includes('tone'))).toBe(true); // bus:(tone)
    expect(bindings).not.toContain('class'); // the static attribute is not a binding
  });

  it('marks a resolved tag, opening and closing, and no native one', () => {
    expect(of('fudComponentTag')).toEqual(['app-badge', 'app-badge']);
  });

  it('returns the tokens in source order', () => {
    const document = new DocumentCache(
      (() => {
        const index = new WorkspaceIndex(memoryFs({ '/p/components/app-x.fud': RICH }));
        index.scan('/p');
        return index;
      })(),
    ).get('/p/components/app-x.fud', 1, RICH);
    const offsets = semanticTokens(document).map((token) => token.span.start);

    expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
  });
});

describe('semanticTokens over the other roles', () => {
  it('marks @section in a route', () => {
    const source = `<link rel="layout" href="../layouts/_layout.fud">\n@section nav {\n  <p>x</p>\n}\n<article>hi</article>\n`;
    const tokens = tokensOf('/p/blog/[slug].fud', source);

    expect(tokens).toContainEqual(['fudDirective', 'section']);
  });

  it('marks @RenderHead, @RenderSection and @RenderBody in a layout', () => {
    const layout = LAYOUT.replace('<main>', '<main>\n      @RenderSection(nav)');
    const tokens = tokensOf('/p/layouts/_other.fud', layout).filter(
      ([type]) => type === 'fudDirective',
    );

    expect(tokens.map(([, text]) => text)).toEqual(['RenderHead', 'RenderSection', 'RenderBody']);
  });

  it('marks a self-closed component tag once: there is no closing tag to mark', () => {
    const source = `<link rel="component" href="./app-badge.fud">\n<app-y>\n  <template shadowrootmode="open"><app-badge/></template>\n</app-y>\n`;
    const tokens = tokensOf('/p/components/app-y.fud', source);

    expect(tokens.filter(([type]) => type === 'fudComponentTag')).toEqual([
      ['fudComponentTag', 'app-badge'],
    ]);
  });

  it('has nothing to say about a document with no constructs', () => {
    expect(tokensOf('/p/components/app-plain.fud', component('app-plain'))).toEqual([]);
  });
});
