import { describe, expect, it } from 'vitest';
import { JsBatch } from '@fudic/compiler';
import { emitVirtualFiles } from '../src/emit.js';
import { codeChunks } from '../src/code.js';
import { parseFud, registryOf } from './_support.js';

const BADGE = `@code {
  type Tone = 'neutral' | 'success';
  const { tone = 'neutral' } = props<{ tone?: Tone }>();
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
  it('emits the client and one CSS virtual, in that order: no server virtual (SDD-60 §4.7)', () => {
    const files = emit(BADGE);

    expect(files.map((f) => f.fileName)).toEqual(['app-badge.fud.ts', 'app-badge.fud.0.css']);
    expect(files.map((f) => f.languageId)).toEqual(['typescript', 'css']);
  });

  it('a region of an old file is read as if it had no wrapper: its body reaches the client virtual', () => {
    const old = '@code {\n  @server {\n    const secret = 1;\n  }\n}\n\n<app-x>\n  <template shadowrootmode="open"><i>hi</i></template>\n</app-x>\n';
    const [client] = emit(old, 'app-x.fud');

    expect(client!.text).toContain('const secret = 1;');
  });

  it('projects the props contract once, from a single Oxc batch', () => {
    const [client] = emit(BADGE);

    expect(client!.text).toContain('const $p0 = props<{ tone?: Tone }>();');
    expect(client!.text).toContain('export type $Props = typeof $p0;');
  });

  it('is deterministic: two emissions are byte-for-byte identical', () => {
    expect(emit(BADGE)).toEqual(emit(BADGE));
  });

  it('emits the client virtual alone for a file with no @code and no <style>', () => {
    const plain = '<app-x>\n  <template shadowrootmode="open"><i>@a</i></template>\n</app-x>\n';
    expect(emit(plain, 'app-x.fud').map((f) => f.fileName)).toEqual(['app-x.fud.ts']);
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

  it('takes a batch someone else already ran, and emits the very same bytes', () => {
    // The language server parses every fragment of the document once — the semantic pass and
    // its own rules need the same AST this emitter needs — so it hands the result over
    // rather than paying for a second Oxc invocation per keystroke (SDD-24 §4.5).
    const document = parseFud(BADGE);
    const batch = new JsBatch(BADGE);
    const code = codeChunks(document.code).map((chunk) => batch.add('module-statements', chunk));
    const shared = emitVirtualFiles({
      source: BADGE,
      fileName: 'app-badge.fud',
      document,
      registry: registryOf({}),
      js: { result: batch.parse().value, code },
    });

    expect(shared.map((f) => f.text)).toEqual(emit(BADGE).map((f) => f.text));
    expect(shared[0]!.text).toContain('const $p0 = props<{ tone?: Tone }>();');
  });

  it('finds no contract in a handed-over batch that registered no chunk of @code', () => {
    const source = `<app-x>\n  <template shadowrootmode="open"><i>hi</i></template>\n</app-x>\n`;
    const [client] = emitVirtualFiles({
      source,
      fileName: 'app-x.fud',
      document: parseFud(source),
      registry: registryOf({}),
      js: { result: new JsBatch(source).parse().value, code: [] },
    });

    expect(client!.text).not.toContain('$p0');
    expect(client!.text).toContain('export type $Props = never;');
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
