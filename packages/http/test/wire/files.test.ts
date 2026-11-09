/**
 * SDD-81 §3.3, criterion 6: the files of a value by their path — what travels in a part of its own,
 * and what stays in `$args` or `$value` — and the slots the server checks a part's name against.
 */

import { describe, expect, it } from 'vitest';
import { binWire } from '../../src/wire/bin.js';
import { jsonWire } from '../../src/wire/json.js';
import { anyFiles, fileSlotAt, hasFiles, joinFiles, joinValue, splitFiles, splitValue, VALUE_PART } from '../../src/wire/files.js';
import type { Ty } from '../../src/wire/ty.js';

const file = (name: string, text = name): File => new File([text], name, { type: 'text/plain' });

const Doc: Ty = { fields: () => ({ title: 'str', adjunto: 'file', extra: { opt: 'file' } }) };
/** A type that names itself: walked once. */
const Tree: Ty = { fields: () => ({ name: 'str', kids: { list: Tree } }) };

const TYPES: Readonly<Record<string, Ty>> = {
  name: 'str',
  avatar: 'file',
  cover: { opt: 'file' },
  fotos: { list: 'file' },
  doc: Doc,
  docs: { list: Doc },
  anexos: { map: ['str', 'file'] },
  notas: { map: ['str', Doc] },
  kind: { oneOf: ['a', 'b'] },
};

describe('hasFiles / anyFiles', () => {
  it('a file anywhere: itself, optional, in a list, a map value, a type at any depth', () => {
    for (const ty of [
      'file',
      { opt: 'file' },
      { list: 'file' },
      { map: ['str', 'file'] },
      Doc,
      { list: { opt: Doc } },
    ] as const satisfies readonly Ty[]) {
      expect(hasFiles(ty)).toBe(true);
    }
  });

  it('none: a primitive, an enum, a map with a file key only in name, a type that names itself without one', () => {
    for (const ty of ['str', 'any', { oneOf: ['a'] }, { map: ['str', 'i32'] }, Tree] as const satisfies readonly Ty[]) {
      expect(hasFiles(ty)).toBe(false);
    }
  });

  it('anyFiles over a function’s arguments', () => {
    expect(anyFiles(TYPES)).toBe(true);
    expect(anyFiles({ a: 'str', t: Tree })).toBe(false);
  });
});

describe('criterion 6: splitFiles names each part by its path', () => {
  const a = file('a.png');
  const f0 = file('f0.png');
  const f1 = file('f1.png');
  const adj = file('adj.pdf');
  const d1 = file('d1.pdf');
  const m0 = file('m0.txt');
  const m1 = file('m1.txt');
  const n1 = file('n1.pdf');
  const args = {
    name: 'Ana',
    avatar: a,
    fotos: [f0, f1],
    doc: { title: 'T', adjunto: adj },
    docs: [{ title: 'x', adjunto: d1 }],
    anexos: { uno: m0, dos: m1 },
    notas: { k: { title: 'n', adjunto: n1 } },
    kind: 'a',
    unknown: 7,
  };

  it('avatar, fotos.1, doc.adjunto, docs.0.adjunto, anexos.1 (a map entry by position)', () => {
    const { rest, files } = splitFiles(TYPES, args);
    expect(files.map(([path]) => path)).toEqual(['avatar', 'fotos.0', 'fotos.1', 'doc.adjunto', 'docs.0.adjunto', 'anexos.0', 'anexos.1', 'notas.0.adjunto']);
    expect(files[2]![1]).toBe(f1);
    // Nothing marks where a file was in the rest; a map keeps its keys with null.
    expect(rest).toEqual({
      name: 'Ana',
      doc: { title: 'T' },
      docs: [{ title: 'x' }],
      anexos: { uno: null, dos: null },
      notas: { k: { title: 'n' } },
      kind: 'a',
      unknown: 7,
    });
  });

  it('an absent file? and an empty file[] write no part', () => {
    expect(splitFiles(TYPES, { name: 'x', fotos: [] })).toEqual({ rest: { name: 'x' }, files: [] });
    expect(splitFiles(TYPES, { name: 'x', doc: null, docs: undefined })).toEqual({ rest: { name: 'x', doc: null }, files: [] });
  });

  it('a Blob in a file slot travels as a File, with its name or none', () => {
    const { files } = splitFiles(TYPES, { avatar: new Blob(['b'], { type: 'image/png' }) });
    expect(files[0]![1]).toBeInstanceOf(File);
    expect(files[0]![1].name).toBe('');
    expect(files[0]![1].type).toBe('image/png');
  });

  it('a value that is not one where a file goes is left out; a wrong shape is left for conform', () => {
    expect(splitFiles(TYPES, { avatar: 'not a file', fotos: 'nope', doc: 'nope', anexos: [1] })).toEqual({
      rest: { fotos: 'nope', doc: 'nope', anexos: [1] },
      files: [],
    });
  });

  it('and joinFiles puts each back in its place', () => {
    const { rest, files } = splitFiles(TYPES, args);
    expect(joinFiles(TYPES, rest, new Map(files))).toEqual(args);
  });

  it('joinFiles: an absent part is absent, file[] collects the parts in a row and stops at a gap', () => {
    const parts = new Map([
      ['fotos.0', f0],
      ['fotos.1', f1],
      ['fotos.3', file('lost')],
    ]);
    const joined = joinFiles(TYPES, { name: 'x', doc: null, docs: 'nope', notas: 3 }, parts);
    expect(joined).toEqual({ name: 'x', fotos: [f0, f1], doc: null, docs: 'nope', notas: 3 });
    expect(joinFiles(TYPES, { name: 'x' }, new Map())).toEqual({ name: 'x', fotos: [] });
  });
});

describe('splitValue / joinValue: what a function returns', () => {
  it('a type with files: the rest and the files by their path from the value', () => {
    const adj = file('adj.pdf');
    const { rest, files } = splitValue(Doc, { title: 'T', adjunto: adj });
    expect(rest).toEqual({ title: 'T' });
    expect(files).toEqual([['adjunto', adj]]);
    expect(joinValue(Doc, rest, new Map(files))).toEqual({ title: 'T', adjunto: adj });
  });

  it('a list of them, and a bare file', () => {
    const one = file('1');
    const { rest, files } = splitValue({ list: Doc }, [{ title: 'a', adjunto: one }]);
    expect(files.map(([p]) => p)).toEqual(['0.adjunto']);
    expect(joinValue({ list: Doc }, rest, new Map(files))).toEqual([{ title: 'a', adjunto: one }]);
    expect(splitValue('file', one)).toEqual({ rest: undefined, files: [['', one]] });
  });

  it('an optional value that is absent stays absent; a list that is not one stays as it is', () => {
    expect(joinValue({ opt: Doc }, null, new Map())).toBeNull();
    expect(joinValue({ opt: Doc }, undefined, new Map())).toBeUndefined();
    expect(joinValue({ list: Doc }, 'x', new Map())).toBe('x');
    expect(joinValue({ oneOf: ['a'] }, 'a', new Map())).toBe('a');
  });

  it('VALUE_PART is $value', () => {
    expect(VALUE_PART).toBe('$value');
  });
});

describe('fileSlotAt: where a part may go before a byte of it is read', () => {
  it('the slots of every shape, any index of a list or a map', () => {
    for (const path of ['avatar', 'cover', 'fotos.0', 'fotos.12', 'doc.adjunto', 'doc.extra', 'docs.3.adjunto', 'anexos.0', 'notas.2.adjunto']) {
      expect(fileSlotAt(TYPES, path), path).toBe(true);
    }
  });

  it('no slot: another field, a deeper path, a bad index, a field that is not there', () => {
    for (const path of ['name', 'nope', 'avatar.0', 'fotos', 'fotos.x', 'fotos.01', 'fotos.-1', 'doc.title', 'doc.ghost', 'docs.0', 'anexos.k', 'kind.0', '$args']) {
      expect(fileSlotAt(TYPES, path), path).toBe(false);
    }
  });
});

describe('criterion 6: in $args a file slot writes nothing, in either format', () => {
  const types: Readonly<Record<string, Ty>> = { name: 'str', avatar: 'file', cover: { opt: 'file' }, fotos: { list: 'file' }, age: { opt: 'i32' } };

  it('fud-bin: the same bytes as the arguments without the file slots, and they read back without them', () => {
    const without: Readonly<Record<string, Ty>> = { name: 'str', age: { opt: 'i32' } };
    const bytes = binWire.encodeArgs(types, { name: 'Ana', age: 3 });
    expect(bytes).toEqual(binWire.encodeArgs(without, { name: 'Ana', age: 3 }));
    expect(binWire.decodeArgs(types, bytes as Uint8Array)).toMatchObject({ name: 'Ana', age: 3 });
  });

  it('JSON: no key for a file slot', () => {
    const text = jsonWire.encodeArgs(types, { name: 'Ana' }) as string;
    expect(JSON.parse(text)).toEqual({ name: 'Ana' });
  });

  it('decodeRest reads a $value without checking it, in both formats', () => {
    expect(binWire.decodeRest(Doc, binWire.encodeValue(Doc, { title: 'T' }) as Uint8Array)).toMatchObject({ title: 'T' });
    expect(jsonWire.decodeRest(Doc, new TextEncoder().encode('{"title":"T"}'))).toEqual({ title: 'T' });
  });
});
