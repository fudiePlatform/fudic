import { describe, expect, it } from 'vitest';
import { emitVirtualFiles } from '../src/emit.js';
import { parseFud, registryOf } from './_support.js';

const BADGE = `@code {
  type Tone = 'neutral' | 'success';
  const { tone = 'neutral' } = props<{ tone?: Tone }>();
  @server {
    const secret = 1;
  }
}

<head>
  <style>:host { color: @tone; }</style>
</head>

<app-badge>
  <template shadowrootmode="open">
    <span class:on="@(tone === 'success')"><slot></slot></span>
  </template>
</app-badge>
`;

const emit = (source: string, fileName = 'app-badge.fud'): ReturnType<typeof emitVirtualFiles> =>
  emitVirtualFiles({
    source,
    fileName,
    document: parseFud(source),
    registry: registryOf({}),
  });

describe('emitVirtualFiles', () => {
  it('emits the client, the server and one CSS virtual, in that order', () => {
    const files = emit(BADGE);

    expect(files.map((f) => f.fileName)).toEqual([
      'app-badge.fud.ts',
      'app-badge.fud.server.ts',
      'app-badge.fud.0.css',
    ]);
    expect(files.map((f) => f.languageId)).toEqual(['typescript', 'typescript', 'css']);
  });

  it('keeps the two programs apart: @server code never reaches the client virtual', () => {
    const [client, server] = emit(BADGE);

    expect(client!.text).not.toContain('secret');
    expect(server!.text).toContain('const secret = 1;');
    // The neutral zone is deliberately in both (§4.1); dedup is the server's job.
    expect(client!.text).toContain("type Tone = 'neutral' | 'success';");
    expect(server!.text).toContain("type Tone = 'neutral' | 'success';");
  });

  it('projects the props contract once, from a single Oxc batch', () => {
    const [client] = emit(BADGE);

    expect(client!.text).toContain('const $p0 = props<{ tone?: Tone }>();');
    expect(client!.text).toContain('export type $Props = typeof $p0;');
  });

  it('is deterministic: two emissions are byte-for-byte identical', () => {
    expect(emit(BADGE)).toEqual(emit(BADGE));
  });

  it('emits the server virtual even for a file with no @code at all', () => {
    const plain = '<app-x>\n  <template shadowrootmode="open"><i>@a</i></template>\n</app-x>\n';
    const files = emit(plain, 'app-x.fud');

    expect(files).toHaveLength(2);
    expect(files[1]!.text).toBe('export {};\n');
  });

  it('still emits from a partial AST: an unclosed element does not stop the projection', () => {
    const broken = '<app-x>\n  <template shadowrootmode="open">\n    <div><span>@title\n  </template>\n</app-x>\n';
    const [client] = emit(broken, 'app-x.fud');

    expect(client!.text).toContain('$text(title);');
  });

  it('does not let a broken @code stop the template: props degrades, the rest survives', () => {
    const broken = `@code {\n  const { a = } = props<{ a?: string }>();\n}\n\n<app-x>\n  <template shadowrootmode="open"><i>@a</i></template>\n</app-x>\n`;
    const [client] = emit(broken, 'app-x.fud');

    expect(client!.text).toContain('$text(a);');
    expect(client!.text).toContain('export type $Props');
  });

  it('maps every user stretch back to the exact source text', () => {
    const [client] = emit(BADGE);

    for (const m of client!.mappings) {
      if (!m.caps.navigation) continue;
      expect(client!.text.slice(m.generatedOffset, m.generatedOffset + m.length)).toBe(
        BADGE.slice(m.sourceOffset, m.sourceOffset + m.length),
      );
    }
  });
});
