/**
 * SDD-70 §3.7 — the frames of the data endpoint: the first with what `load` resolved and the
 * layout's props, then one per `later` field as it settles, in `fud-bin` by the types of the
 * `.fudapi`. Read back, the first frame resolves at once and each field waits for its own.
 */

import { describe, expect, it } from 'vitest';
import { readFrames, typesOfShape, writeFrames, type DataTypes, type SettledField } from '../../src/wire/frames.js';
import type { Ty } from '../../src/wire/ty.js';

const PERSON: Ty = { fields: () => ({ id: 'i32', name: 'str' }) };
const TYPES: DataTypes = {
  fields: { title: 'str', when: 'date', users: { list: PERSON }, stats: 'u32' },
  later: ['users', 'stats'],
};

/** A promise and the hand that settles it, the way `runLoad` leaves a `later` field. */
function settling(): { promise: Promise<SettledField>; settle: (s: SettledField) => void } {
  const { promise, resolve } = Promise.withResolvers<SettledField>();
  return { promise, settle: resolve };
}

/** Every chunk of a stream, as they come. */
async function chunks(stream: ReadableStream<Uint8Array>): Promise<Uint8Array[]> {
  const out: Uint8Array[] = [];
  for await (const chunk of stream as unknown as AsyncIterable<Uint8Array>) out.push(chunk);
  return out;
}

/** One byte at a time: what the reader must put back together. */
function trickle(bytes: readonly Uint8Array[]): ReadableStream<Uint8Array> {
  const all = bytes.flatMap((b) => [...b]);
  return new ReadableStream({
    start(controller) {
      for (const byte of all) controller.enqueue(Uint8Array.of(byte));
      controller.close();
    },
  });
}

describe('writeFrames', () => {
  it('the first frame goes before any `later` field settles, and one frame follows per field', async () => {
    const users = settling();
    const stats = settling();
    const stream = writeFrames(TYPES, { title: 't', when: new Date(0), users: users.promise, stats: stats.promise }, { menu: ['a'] });
    const reader = stream.getReader();
    const first = await reader.read();
    expect(first.done).toBe(false);
    // In the order they settle, not the order they were declared.
    stats.settle({ ok: 12 });
    expect((await reader.read()).done).toBe(false);
    users.settle({ error: { status: 404, title: 'Not Found' } });
    expect((await reader.read()).done).toBe(false);
    expect((await reader.read()).done).toBe(true);
  });

  it('a route without `later` fields answers with one frame', async () => {
    expect(await chunks(writeFrames({ fields: { title: 'str' } }, { title: 't' }))).toHaveLength(1);
  });
});

describe('readFrames', () => {
  it('resolves with the first frame, and each `later` field with its own', async () => {
    const users = settling();
    const stats = settling();
    const stream = writeFrames(TYPES, { title: 't', when: new Date(0), users: users.promise, stats: stats.promise }, { menu: ['a'] });
    const read = await readFrames(TYPES, stream);
    expect(read.layout).toEqual({ menu: ['a'] });
    expect(read.data['title']).toBe('t');
    // Typed: a `date` comes back a `Date`, which JSON never gave.
    expect(read.data['when']).toEqual(new Date(0));

    let got: SettledField | undefined;
    void (read.data['users'] as Promise<SettledField>).then((s) => (got = s));
    stats.settle({ ok: 12 });
    expect(await read.data['stats']).toEqual({ ok: 12 });
    expect(got).toBeUndefined();
    users.settle({ ok: [{ id: 1, name: 'Ana' }] });
    expect(await read.data['users']).toEqual({ ok: [{ id: 1, name: 'Ana' }] });
  });

  it('a field that failed arrives as its problem', async () => {
    const stream = writeFrames(TYPES, {
      title: 't',
      when: new Date(0),
      users: Promise.resolve({ error: { status: 500, title: 'Boom' } }),
      stats: Promise.resolve({ ok: 1 }),
    });
    const read = await readFrames(TYPES, stream);
    expect(await read.data['users']).toEqual({ error: { status: 500, title: 'Boom' } });
    expect('layout' in read).toBe(false);
  });

  it('frames cut at any byte are put back together', async () => {
    const bytes = await chunks(
      writeFrames(TYPES, { title: 't', when: new Date(0), users: Promise.resolve({ ok: [] }), stats: Promise.resolve({ ok: 3 }) }, 'x'),
    );
    const read = await readFrames(TYPES, trickle(bytes));
    expect(read.layout).toBe('x');
    expect(await read.data['stats']).toEqual({ ok: 3 });
    expect(await read.data['users']).toEqual({ ok: [] });
  });

  it('without declared types, `data` travels as text keys and `any` values', async () => {
    const read = await readFrames({}, writeFrames({}, { a: 1, b: 'x' }));
    expect(read.data).toEqual({ a: 1, b: 'x' });
  });

  it('a field whose frame never comes settles to a 500 when the answer ends', async () => {
    const [head] = await chunks(writeFrames(TYPES, { title: 't', when: new Date(0), users: Promise.resolve({ ok: [] }), stats: Promise.resolve({ ok: 1 }) }));
    const read = await readFrames(TYPES, trickle([head!]));
    expect(await read.data['users']).toEqual({ error: { status: 500, title: 'The data stream ended early' } });
  });

  it('an answer that breaks off settles what is missing the same way', async () => {
    const [head] = await chunks(writeFrames(TYPES, { title: 't', when: new Date(0), users: Promise.resolve({ ok: [] }), stats: Promise.resolve({ ok: 1 }) }));
    const broken = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(head!);
        controller.error(new Error('network'));
      },
    });
    const read = await readFrames(TYPES, broken);
    expect(await read.data['stats']).toEqual({ error: { status: 500, title: 'The data stream ended early' } });
  });

  it('an answer that ends before its first frame rejects', async () => {
    await expect(readFrames(TYPES, trickle([]))).rejects.toThrow('fudic: the data stream ended before its first frame');
  });
});

describe('typesOfShape — the types as JSON, for the Service Worker', () => {
  it('reads what the descriptors of the `.fudapi` wrote, a type that names itself included', async () => {
    const NODE: Ty = { fields: () => ({ id: 'i32', next: { opt: NODE }, tone: { oneOf: ['a', 'b'] } }) };
    const written: DataTypes = { fields: { title: 'str', head: NODE, byId: { map: ['str', NODE] }, all: { list: NODE } }, later: ['all'] };
    const shape = {
      fields: { title: 'str', head: { ref: 'Node' }, byId: { map: ['str', { ref: 'Node' }] as const }, all: { list: { ref: 'Node' } } },
      types: { Node: { id: 'i32', next: { opt: { ref: 'Node' } }, tone: { oneOf: ['a', 'b'] } } },
      later: ['all'],
    };
    const node = { id: 1, next: { id: 2, tone: 'b' }, tone: 'a' };
    const stream = writeFrames(written, { title: 't', head: node, byId: { x: node }, all: Promise.resolve({ ok: [node] }) });
    const read = await readFrames(typesOfShape(shape), stream);
    expect(read.data['head']).toEqual(node);
    expect(read.data['byId']).toEqual({ x: node });
    expect(await read.data['all']).toEqual({ ok: [node] });
  });
});
