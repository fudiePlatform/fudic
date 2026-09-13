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

/** A segment plus its fifth field, absolute — `undefined` when the segment has four. */
interface NamedSegment extends Segment {
  readonly nameIndex: number | undefined;
}

/**
 * Decode `mappings` keeping the fifth field (BUG-31). Separate from `decodeMappings` so the
 * four-field assertions above stay exactly as strict as they were: a segment that grew a
 * name has to fail them, not slip past.
 */
function decodeNamed(mappings: string): NamedSegment[] {
  const segs: NamedSegment[] = [];
  let srcIndex = 0;
  let srcLine = 0;
  let srcCol = 0;
  let nameIndex = 0;
  const lines = mappings.split(';');
  for (let l = 0; l < lines.length; l += 1) {
    let genCol = 0;
    const lineStr = lines[l];
    if (lineStr === undefined || lineStr === '') continue;
    for (const segStr of lineStr.split(',')) {
      const fields = decodeVlqs(segStr);
      const [dGenCol = 0, dSrcIndex = 0, dSrcLine = 0, dSrcCol = 0, dName] = fields;
      genCol += dGenCol;
      srcIndex += dSrcIndex;
      srcLine += dSrcLine;
      srcCol += dSrcCol;
      if (dName !== undefined) nameIndex += dName;
      segs.push({
        genLine: l,
        genCol,
        srcIndex,
        srcLine,
        srcCol,
        nameIndex: dName === undefined ? undefined : nameIndex,
      });
    }
  }
  return segs;
}

/** How many VLQ fields each segment of `mappings` carries, in order. */
const fieldCounts = (mappings: string): number[] =>
  mappings
    .split(';')
    .flatMap((line) => (line === '' ? [] : line.split(',')))
    .map((seg) => decodeVlqs(seg).length);

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

/**
 * BUG-31 — the fifth field. Without `names` a debugger can show the right LINE and still be
 * unable to answer `n()` in the console: after a minifier renames `n` to `p`, positions alone
 * cannot say the two spellings are the same binding. Before this the builder emitted
 * `names: []` and four fields, always.
 */
describe('SourceMapBuilder — the fifth field (BUG-31)', () => {
  /** A builder over two identical one-line texts, long enough for any offset used below. */
  const builderOf = (): SourceMapBuilder => {
    const text = 'x'.repeat(80);
    return new SourceMapBuilder({
      file: 'out.js',
      source: 's.fud',
      sourceContent: text,
      sourceLineMap: new LineMap(text),
      generatedLineMap: new LineMap(text),
    });
  };

  it('a mapping with no name stays at four fields, and one with a name has five', () => {
    const b = builderOf();
    b.addMapping(0, 0);
    b.addMapping(4, 4, 'count');
    expect(fieldCounts(b.build().mappings)).toEqual([4, 5]);
  });

  it('collects the names in order of first appearance', () => {
    const b = builderOf();
    b.addMapping(0, 0, 'signal');
    b.addMapping(4, 4, 'count');
    b.addMapping(8, 8, 'inc');
    expect(b.build().names).toEqual(['signal', 'count', 'inc']);
  });

  it('the same identifier twice shares ONE index and is not duplicated', () => {
    const b = builderOf();
    b.addMapping(0, 0, 'count');
    b.addMapping(4, 4, 'other');
    b.addMapping(8, 8, 'count');
    const map = b.build();
    expect(map.names).toEqual(['count', 'other']);
    expect(decodeNamed(map.mappings).map((s) => s.nameIndex)).toEqual([0, 1, 0]);
  });

  it('the fifth field is a DELTA against the previous index, not the index itself', () => {
    // Three names in a row: absolute 0, 1, 2 — but the deltas on the wire are 0, 1, 1. A
    // builder writing the index straight out passes an absolute check and produces a map
    // that drifts the moment two segments share a name.
    const b = builderOf();
    b.addMapping(0, 0, 'a');
    b.addMapping(4, 4, 'b');
    b.addMapping(8, 8, 'c');
    const mappings = b.build().mappings;
    const raw = mappings.split(',').map((seg) => decodeVlqs(seg)[4]);
    expect(raw).toEqual([0, 1, 1]);
    expect(decodeNamed(mappings).map((s) => s.nameIndex)).toEqual([0, 1, 2]);
  });

  it('carries the delta across a four-field segment in between', () => {
    // The previous index is state of the whole map, not of the line or of the run: a
    // nameless segment must not reset it.
    const b = builderOf();
    b.addMapping(0, 0, 'a');
    b.addMapping(4, 4, 'b');
    b.addMapping(8, 8);
    b.addMapping(12, 12, 'a');
    const decoded = decodeNamed(b.build().mappings);
    expect(decoded.map((s) => s.nameIndex)).toEqual([0, 1, undefined, 0]);
  });

  it('names survive the sort: the index follows the identifier, not the insertion order', () => {
    // `build()` sorts by generated position, and the names array is filled while READING the
    // sorted segments — so the first name in the array is the first one in the OUTPUT.
    const b = builderOf();
    b.addMapping(8, 8, 'later');
    b.addMapping(0, 0, 'first');
    const map = b.build();
    expect(map.names).toEqual(['first', 'later']);
    expect(decodeNamed(map.mappings).map((s) => s.nameIndex)).toEqual([0, 1]);
  });

  it('stays idempotent with names: two builds give the same map', () => {
    const b = builderOf();
    b.addMapping(0, 0, 'a');
    b.addMapping(4, 4, 'b');
    const first = b.build();
    const second = b.build();
    expect(second.mappings).toBe(first.mappings);
    expect(second.names).toEqual(first.names);
  });

  it('encodes a multi-digit name index when there are more than sixteen of them', () => {
    const b = builderOf();
    for (let i = 0; i < 20; i += 1) b.addMapping(i, i, `n${i}`);
    const map = b.build();
    expect(map.names).toHaveLength(20);
    expect(decodeNamed(map.mappings).map((s) => s.nameIndex)).toEqual(
      Array.from({ length: 20 }, (_, i) => i),
    );
  });
});
