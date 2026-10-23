import { describe, expect, it } from 'vitest';
import { codeChunks } from '../src/code.js';
import { clientFileName, componentModuleSpecifier, styleFileName } from '../src/paths.js';
import { codeOf, parseFud } from './_support.js';

const BADGE = `@code {
  type Tone = 'neutral' | 'success';
  @client {
    let hovered = false;
  }
  @server {
    const secret = 1;
  }
}

<app-badge>
  <template shadowrootmode="open">
    <span class="badge"><slot></slot></span>
  </template>
</app-badge>
`;

const NO_CODE = `<app-plain>
  <template shadowrootmode="open"><span></span></template>
</app-plain>
`;

const slice = (source: string, spans: readonly { start: number; end: number }[]): string[] =>
  spans.map((s) => source.slice(s.start, s.end).trim());

describe('codeChunks', () => {
  it('every chunk of the @code in source order, a region read as if it had no wrapper (SDD-60 §4.8)', () => {
    const chunks = codeChunks(codeOf(parseFud(BADGE)));

    expect(slice(BADGE, chunks)).toEqual([
      "type Tone = 'neutral' | 'success';",
      'let hovered = false;',
      'const secret = 1;',
    ]);
  });

  it('none when the file has no @code', () => {
    expect(codeChunks(codeOf(parseFud(NO_CODE)))).toEqual([]);
  });
});

describe('virtual file names', () => {
  it('derives the virtuals from the .fud path', () => {
    expect(clientFileName('blog/[slug].fud')).toBe('blog/[slug].fud.ts');
    expect(styleFileName('app-badge.fud', 0)).toBe('app-badge.fud.0.css');
  });

  it("keeps the user's href, only ensuring it reads as a relative path", () => {
    expect(componentModuleSpecifier('./x.fud')).toBe('./x.fud');
    expect(componentModuleSpecifier('../ui/x.fud')).toBe('../ui/x.fud');
    expect(componentModuleSpecifier('/ui/x.fud')).toBe('/ui/x.fud');
    expect(componentModuleSpecifier('x.fud')).toBe('./x.fud');
  });

  it("leaves a package's href as it is, for TypeScript to resolve through its exports", () => {
    expect(componentModuleSpecifier('@shop/ui/snippets/ui.fud')).toBe('@shop/ui/snippets/ui.fud');
    expect(componentModuleSpecifier('ui-kit/card.fud')).toBe('ui-kit/card.fud');
  });
});
