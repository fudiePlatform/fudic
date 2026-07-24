/**
 * SDD-13 acceptance criteria (§6) for `SourceMapBuilder`: a valid Source Map v3
 * whose `mappings` decode (VLQ) to the expected segments, and the composition with
 * SDD-11 (`mapOffset`) that anchors a JS buffer node back to the `.fud`.
 */

import { describe, it, expect } from 'vitest';
import { LineMap, SourceMapBuilder } from '../../src/sourcemap/index.js';
import { JsBatch, type OxcNode } from '../../src/oxc/index.js';
import { span } from '../../src/types/index.js';

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Decode a run of Base64 VLQ digits into signed integers. */
function decodeVlqs(field: string): number[] {
  const out: number[] = [];
  let shift = 0;
  let value = 0;
  for (const ch of field) {
    const digit = BASE64.indexOf(ch);
    value += (digit & 31) << shift;
    if (digit & 32) {
      shift += 5;
    } else {
      const negate = value & 1;
      value >>= 1;
      out.push(negate ? -value : value);
      value = 0;
      shift = 0;
    }
  }
  return out;
}

interface Segment {
  readonly genLine: number;
  readonly genCol: number;
  readonly srcIndex: number;
  readonly srcLine: number;
  readonly srcCol: number;
}

/** Decode the full `mappings` string into absolute segments. */
function decodeMappings(mappings: string): Segment[] {
  const segs: Segment[] = [];
  let genCol = 0;
  let srcIndex = 0;
  let srcLine = 0;
  let srcCol = 0;
  const lines = mappings.split(';');
  for (let l = 0; l < lines.length; l += 1) {
    genCol = 0;
    const lineStr = lines[l];
    if (lineStr === undefined || lineStr === '') {
      continue;
    }
    for (const segStr of lineStr.split(',')) {
      const [dGenCol = 0, dSrcIndex = 0, dSrcLine = 0, dSrcCol = 0] = decodeVlqs(segStr);
      genCol += dGenCol;
      srcIndex += dSrcIndex;
      srcLine += dSrcLine;
      srcCol += dSrcCol;
      segs.push({ genLine: l, genCol, srcIndex, srcLine, srcCol });
    }
  }
  return segs;
}

/** Narrow the ast() union to a single node. */
function single(v: OxcNode | readonly OxcNode[]): OxcNode {
  if (Array.isArray(v)) throw new Error('expected a single node');
  return v as OxcNode;
}

describe('SourceMapBuilder — valid v3 (crit. #6)', () => {
  it('serializes the envelope and decodes to the expected segments', () => {
    const sourceContent = 'let x;\nlet y;';
    const generatedContent = 'const x;\nconst y;';
    const builder = new SourceMapBuilder({
      file: 'out.js',
      source: 'home.fud',
      sourceContent,
      sourceLineMap: new LineMap(sourceContent),
      generatedLineMap: new LineMap(generatedContent),
    });
    // generated (line 0, col 6) ← source (line 0, col 4); generated (line 1, col 6) ← source (line 1, col 4)
    builder.addMapping(6, 4);
    builder.addMapping(15, 11);

    const map = builder.build();
    expect(map.version).toBe(3);
    expect(map.file).toBe('out.js');
    expect(map.sources).toEqual(['home.fud']);
    expect(map.sourcesContent).toEqual([sourceContent]);
    expect(map.names).toEqual([]);

    expect(decodeMappings(map.mappings)).toEqual([
      { genLine: 0, genCol: 6, srcIndex: 0, srcLine: 0, srcCol: 4 },
      { genLine: 1, genCol: 6, srcIndex: 0, srcLine: 1, srcCol: 4 },
    ]);
  });

  it('sorts by generated position and is idempotent', () => {
    const text = 'aaaaaa';
    const builder = new SourceMapBuilder({
      file: 'out.js',
      source: 's.fud',
      sourceContent: text,
      sourceLineMap: new LineMap(text),
      generatedLineMap: new LineMap(text),
    });
    builder.addMapping(4, 0);
    builder.addMapping(1, 2); // added out of order

    const first = builder.build();
    const second = builder.build();
    expect(first.mappings).toBe(second.mappings); // idempotent

    const segs = decodeMappings(first.mappings);
    expect(segs.map((s) => s.genCol)).toEqual([1, 4]); // sorted by generated column
  });

  it('encodes multi-digit VLQ for deltas ≥ 16 (continuation bit)', () => {
    const text = 'x'.repeat(40);
    const builder = new SourceMapBuilder({
      file: 'out.js',
      source: 's.fud',
      sourceContent: text,
      sourceLineMap: new LineMap(text),
      generatedLineMap: new LineMap(text),
    });
    builder.addMapping(20, 30); // both deltas exceed 16 → each needs a continuation digit

    const [seg] = decodeMappings(builder.build().mappings);
    expect(seg).toEqual({ genLine: 0, genCol: 20, srcIndex: 0, srcLine: 0, srcCol: 30 });
  });

  it('produces an empty mappings string with no segments', () => {
    const builder = new SourceMapBuilder({
      file: 'out.js',
      source: 's.fud',
      sourceContent: '',
      sourceLineMap: new LineMap(''),
      generatedLineMap: new LineMap(''),
    });
    expect(builder.build().mappings).toBe('');
  });
});

describe('SourceMapBuilder — composition with SDD-11 (crit. #7)', () => {
  it('anchors a JS buffer node back to the .fud position via mapOffset', () => {
    // The expression `variant` sits on line 1 of the .fud source.
    const source = '<p>\n@(variant)</p>';
    const exprSpan = span(source.indexOf('variant'), source.indexOf('variant') + 'variant'.length);

    const batch = new JsBatch(source);
    const id = batch.add('expression', exprSpan);
    const { value, diagnostics } = batch.parse();
    expect(diagnostics).toEqual([]);

    const ast = single(value.ast(id));
    expect(ast.type).toBe('Identifier');

    // Buffer offset → source offset (SDD-11), then fed to the builder (SDD-13).
    const sourceOffset = value.mapOffset(ast.start);
    const sourceLineMap = new LineMap(source);
    const expected = sourceLineMap.positionAt(sourceOffset);
    expect(expected.line).toBe(1); // `variant` is on the second line

    const generated = 'X = variant;';
    const builder = new SourceMapBuilder({
      file: 'out.js',
      source: 'home.fud',
      sourceContent: source,
      sourceLineMap,
      generatedLineMap: new LineMap(generated),
    });
    builder.addMapping(generated.indexOf('variant'), sourceOffset);

    const [seg] = decodeMappings(builder.build().mappings);
    expect(seg).toEqual({
      genLine: 0,
      genCol: generated.indexOf('variant'),
      srcIndex: 0,
      srcLine: expected.line,
      srcCol: expected.character,
    });
  });
});
