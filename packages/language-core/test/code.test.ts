import { describe, expect, it } from 'vitest';
import { partitionCode } from '../src/code.js';
import { emitServerVirtual } from '../src/emit-server.js';
import {
  clientFileName,
  componentModuleSpecifier,
  serverFileName,
  serverModuleSpecifier,
  styleFileName,
} from '../src/paths.js';
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

describe('partitionCode', () => {
  it('groups the parts by audience, keeping source order', () => {
    const parts = partitionCode(codeOf(parseFud(BADGE)));

    expect(slice(BADGE, parts.neutral)).toEqual(["type Tone = 'neutral' | 'success';"]);
    expect(slice(BADGE, parts.client)).toEqual(['let hovered = false;']);
    expect(slice(BADGE, parts.server)).toEqual(['const secret = 1;']);
  });

  it('yields three empty groups when the file has no @code', () => {
    expect(partitionCode(codeOf(parseFud(NO_CODE)))).toEqual({
      neutral: [],
      server: [],
      client: [],
    });
  });

  it('keeps a repeated region instead of dropping it: uniqueness is a semantic diagnostic', () => {
    const twice = `@code {
  @client { let a = 1; }
  @client { let b = 2; }
}

<app-x><template shadowrootmode="open"><i></i></template></app-x>
`;
    const parts = partitionCode(codeOf(parseFud(twice)));

    expect(slice(twice, parts.client)).toEqual(['let a = 1;', 'let b = 2;']);
  });
});

describe('emitServerVirtual', () => {
  it('carries the neutral zone and the @server region, and nothing of @client', () => {
    const file = emitServerVirtual(BADGE, 'app-badge.fud', codeOf(parseFud(BADGE)));

    expect(file.text).toContain("type Tone = 'neutral' | 'success';");
    expect(file.text).toContain('const secret = 1;');
    expect(file.text).not.toContain('hovered');
  });

  it('is emitted even with no @code, as an empty module', () => {
    const file = emitServerVirtual(NO_CODE, 'app-plain.fud', codeOf(parseFud(NO_CODE)));

    expect(file.text).toBe('export {};\n');
    expect(file.fileName).toBe('app-plain.fud.server.ts');
    expect(file.languageId).toBe('typescript');
  });

  it('maps the user code and leaves the scaffolding unmapped', () => {
    const file = emitServerVirtual(BADGE, 'app-badge.fud', codeOf(parseFud(BADGE)));

    expect(file.mappings).toHaveLength(2);
    for (const m of file.mappings) {
      expect(m.caps.navigation).toBe(true);
      expect(BADGE.slice(m.sourceOffset, m.sourceOffset + m.length)).toBe(
        file.text.slice(m.generatedOffset, m.generatedOffset + m.length),
      );
    }
  });
});

describe('virtual file names', () => {
  it('derives the three virtuals from the .fud path', () => {
    expect(clientFileName('blog/[slug].fud')).toBe('blog/[slug].fud.ts');
    expect(serverFileName('blog/[slug].fud')).toBe('blog/[slug].fud.server.ts');
    expect(styleFileName('app-badge.fud', 0)).toBe('app-badge.fud.0.css');
  });

  it('names the server sibling relative and extensionless', () => {
    expect(serverModuleSpecifier('blog/[slug].fud')).toBe('./[slug].fud.server');
    expect(serverModuleSpecifier('index.fud')).toBe('./index.fud.server');
    expect(serverModuleSpecifier('c:\\site\\index.fud')).toBe('./index.fud.server');
  });

  it("keeps the user's href, only ensuring it reads as a relative path", () => {
    expect(componentModuleSpecifier('./x.fud')).toBe('./x.fud');
    expect(componentModuleSpecifier('../ui/x.fud')).toBe('../ui/x.fud');
    expect(componentModuleSpecifier('/ui/x.fud')).toBe('/ui/x.fud');
    expect(componentModuleSpecifier('x.fud')).toBe('./x.fud');
  });
});
