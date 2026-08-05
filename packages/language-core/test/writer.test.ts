import { describe, expect, it } from 'vitest';
import { span } from '@fudic/compiler';
import { VirtualWriter } from '../src/writer.js';
import { SCAFFOLD_CAPS, USER_CAPS, USER_ECHO_CAPS } from '../src/caps.js';
import { GLOBALS_DTS, GLOBALS_FILE_NAME } from '../src/globals.js';
import { VERSION } from '../src/index.js';

const SOURCE = 'const tone = 42;';

describe('VirtualWriter.copy', () => {
  it('copies the source stretch verbatim and maps it 1:1', () => {
    const w = new VirtualWriter(SOURCE);
    w.copy(span(6, 10));

    const file = w.build('x.fud.ts', 'typescript');
    expect(file.text).toBe('tone');
    expect(file.mappings).toEqual([
      { sourceOffset: 6, generatedOffset: 0, length: 4, sourceLength: 4, caps: USER_CAPS },
    ]);
  });

  it('maps every copy to its own generated offset', () => {
    const w = new VirtualWriter(SOURCE);
    w.copy(span(0, 5));
    w.scaffold(' ');
    w.copy(span(6, 10));

    const file = w.build('x.fud.ts', 'typescript');
    expect(file.text).toBe('const tone');
    expect(file.mappings.map((m) => [m.sourceOffset, m.generatedOffset, m.length])).toEqual([
      [0, 0, 5],
      [6, 6, 4],
    ]);
  });

  it('ignores an empty span: a zero-length mapping is noise no position falls into', () => {
    const w = new VirtualWriter(SOURCE);
    w.copy(span(3, 3));

    const file = w.build('x.fud.ts', 'typescript');
    expect(file.text).toBe('');
    expect(file.mappings).toEqual([]);
  });
});

describe('VirtualWriter.scaffold', () => {
  it('records an anchored stretch with every capability off', () => {
    const w = new VirtualWriter(SOURCE);
    w.scaffold('$text(', span(2, 7));

    const file = w.build('x.fud.ts', 'typescript');
    expect(file.text).toBe('$text(');
    // Six generated characters standing for the five of the anchor: the two lengths are
    // independent, and only a verbatim copy has them equal.
    expect(file.mappings).toEqual([
      { sourceOffset: 2, generatedOffset: 0, length: 6, sourceLength: 5, caps: SCAFFOLD_CAPS },
    ]);
    expect(Object.values(SCAFFOLD_CAPS).every((c) => c === false)).toBe(true);
  });

  it('records no mapping for unanchored punctuation', () => {
    const w = new VirtualWriter(SOURCE);
    w.scaffold(');\n');

    const file = w.build('x.fud.ts', 'typescript');
    expect(file.text).toBe(');\n');
    expect(file.mappings).toEqual([]);
  });

  it('ignores empty projected text', () => {
    const w = new VirtualWriter(SOURCE);
    w.projected('', span(0, 3), USER_CAPS);

    expect(w.offset).toBe(0);
    expect(w.build('x.fud.ts', 'typescript').mappings).toEqual([]);
  });

  it('ignores empty text', () => {
    const w = new VirtualWriter(SOURCE);
    w.scaffold('', span(0, 3));

    expect(w.offset).toBe(0);
    expect(w.build('x.fud.ts', 'typescript').mappings).toEqual([]);
  });
});

describe('VirtualWriter.build', () => {
  it('tracks the generated offset across chunks', () => {
    const w = new VirtualWriter(SOURCE);
    expect(w.offset).toBe(0);
    w.scaffold('ab');
    expect(w.offset).toBe(2);
    w.copy(span(0, 5));
    expect(w.offset).toBe(7);
  });

  it('carries the file name and language id', () => {
    const file = new VirtualWriter(SOURCE).build('a/b.fud.1.css', 'css');
    expect(file.fileName).toBe('a/b.fud.1.css');
    expect(file.languageId).toBe('css');
  });

  it('snapshots the mappings: writing on does not mutate an already built file', () => {
    const w = new VirtualWriter(SOURCE);
    w.copy(span(0, 5));
    const first = w.build('x.fud.ts', 'typescript');
    w.copy(span(6, 10));

    expect(first.mappings).toHaveLength(1);
    expect(w.build('x.fud.ts', 'typescript').mappings).toHaveLength(2);
  });

  it('is deterministic: the same calls produce the same bytes and mappings', () => {
    const write = (): ReturnType<VirtualWriter['build']> => {
      const w = new VirtualWriter(SOURCE);
      w.scaffold('$text(', span(6, 10));
      w.copy(span(6, 10));
      w.scaffold(');');
      return w.build('x.fud.ts', 'typescript');
    };

    expect(write()).toEqual(write());
  });
});

describe('package surface', () => {
  it('exposes user capabilities with formatting off: a virtual is never formatted', () => {
    expect(USER_CAPS).toEqual({
      // Additional, not exclusive: Volar gives a position to the first projection that
      // answers it and skips the rest, and the root code — where the server's own snippets
      // and links come from — is visited last (SDD-28 §5.5).
      completion: { isAdditional: true },
      verification: true,
      semantic: true,
      navigation: true,
      structure: true,
      format: false,
    });
  });

  it('the echo of the neutral zone offers no completion, and everything else', () => {
    // The neutral zone lives in both virtuals; the client one is canonical, exactly as it
    // already is for the duplicate diagnostics.
    expect(USER_ECHO_CAPS).toEqual({ ...USER_CAPS, completion: false });
  });

  it('exposes the ambient globals as one source for server and CLI', () => {
    expect(GLOBALS_FILE_NAME).toBe('fudic-globals.d.ts');
    expect(GLOBALS_DTS).toContain('declare function props<T>(): T;');
    expect(GLOBALS_DTS).toContain('declare function $text(v: $Scalar): void;');
    expect(VERSION).toBe('0.0.1');
  });
});
