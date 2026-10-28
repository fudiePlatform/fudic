/**
 * The two ends of the binary format (SDD-56 §4.18, SDD-67 §3.1), behind one interface. Every
 * operation takes the value to write, or `undefined` to read one, and returns the value either
 * way: the walk in `bin.ts` calls them in the same order in both directions, and that is what
 * keeps the writer and the reader from drifting apart.
 *
 * The reader never trusts what it reads (SDD-67 §4.2): every failure is a `RangeError` whose
 * message starts with `binary body:`, and it never sets memory aside for a length before
 * checking that the bytes behind it exist.
 */

export type Width = 'u8' | 'i8' | 'u16' | 'i16' | 'u32' | 'i32' | 'f32' | 'f64';

export interface Io {
  /** `count` flags, packed 8 to a byte, first flag in the lowest bit. */
  bits(count: number, values: readonly boolean[] | undefined): boolean[];
  /** A number of a fixed width, little-endian. */
  num(width: Width, v: number | undefined): number;
  /** An unsigned LEB128 varint. */
  varint(v: number | undefined): number;
  /** An instant: milliseconds since the epoch, as a signed 48-bit integer. */
  date(v: Date | undefined): Date;
  /** UTF-8 bytes after their length as a varint. */
  str(v: string | undefined): string;
  /** `count` bytes as they are. */
  raw(count: number, v: Uint8Array | undefined): Uint8Array;
  /**
   * A count just read promises at least `bits` more bits of body: the reader refuses it when
   * what is left is shorter, before anything is made for it. The writer has nothing to check.
   */
  claim(bits: number): void;
}

const BYTES: Readonly<Record<Width, number>> = {
  u8: 1, i8: 1, u16: 2, i16: 2, u32: 4, i32: 4, f32: 4, f64: 8,
};

const TWO_32 = 2 ** 32;
/** A varint past 2^53 is no length and no index anything could have: 8 bytes are 56 bits. */
const VARINT_BYTES = 8;
const utf8 = new TextEncoder();

export class Writer implements Io {
  private buffer = new Uint8Array(64);
  private length = 0;

  /** What was written. */
  bytes(): Uint8Array {
    return this.buffer.slice(0, this.length);
  }

  private reserve(n: number): DataView {
    if (this.length + n > this.buffer.length) {
      const grown = new Uint8Array(Math.max(this.buffer.length * 2, this.length + n));
      grown.set(this.buffer);
      this.buffer = grown;
    }
    const view = new DataView(this.buffer.buffer, this.length, n);
    this.length += n;
    return view;
  }

  bits(count: number, values: readonly boolean[] | undefined): boolean[] {
    const flags = values as readonly boolean[];
    const view = this.reserve(Math.ceil(count / 8));
    flags.forEach((on, i) => {
      if (on) view.setUint8(i >> 3, view.getUint8(i >> 3) | (1 << (i & 7)));
    });
    return [...flags];
  }

  num(width: Width, v: number | undefined): number {
    const n = v as number;
    const view = this.reserve(BYTES[width]);
    if (width === 'u8') view.setUint8(0, n);
    else if (width === 'i8') view.setInt8(0, n);
    else if (width === 'u16') view.setUint16(0, n, true);
    else if (width === 'i16') view.setInt16(0, n, true);
    else if (width === 'u32') view.setUint32(0, n, true);
    else if (width === 'i32') view.setInt32(0, n, true);
    else if (width === 'f32') view.setFloat32(0, n, true);
    else view.setFloat64(0, n, true);
    return n;
  }

  varint(v: number | undefined): number {
    let n = v as number;
    const out: number[] = [];
    do {
      const low = n % 128;
      n = Math.floor(n / 128);
      out.push(n > 0 ? low | 128 : low);
    } while (n > 0);
    const view = this.reserve(out.length);
    out.forEach((b, i) => view.setUint8(i, b));
    return v as number;
  }

  date(v: Date | undefined): Date {
    const ms = (v as Date).getTime();
    const high = Math.floor(ms / TWO_32);
    this.num('u32', ms - high * TWO_32);
    this.num('i16', high);
    return v as Date;
  }

  str(v: string | undefined): string {
    const encoded = utf8.encode(v as string);
    this.varint(encoded.length);
    this.raw(encoded.length, encoded);
    return v as string;
  }

  raw(count: number, v: Uint8Array | undefined): Uint8Array {
    const view = this.reserve(count);
    new Uint8Array(view.buffer, view.byteOffset, count).set(v as Uint8Array);
    return v as Uint8Array;
  }

  claim(): void {}
}

export class Reader implements Io {
  private offset = 0;
  private readonly view: DataView;
  private readonly text = new TextDecoder('utf-8', { fatal: true });

  constructor(private readonly input: Uint8Array) {
    this.view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  }

  /** Whether every byte was read: a body longer than its schema is not this schema's. */
  done(): boolean {
    return this.offset === this.input.length;
  }

  private take(n: number): number {
    if (this.offset + n > this.input.length) {
      throw new RangeError('binary body: shorter than its schema');
    }
    const at = this.offset;
    this.offset += n;
    return at;
  }

  bits(count: number): boolean[] {
    const at = this.take(Math.ceil(count / 8));
    return Array.from({ length: count }, (_, i) => (this.view.getUint8(at + (i >> 3)) & (1 << (i & 7))) !== 0);
  }

  num(width: Width): number {
    const at = this.take(BYTES[width]);
    const v = this.view;
    if (width === 'u8') return v.getUint8(at);
    if (width === 'i8') return v.getInt8(at);
    if (width === 'u16') return v.getUint16(at, true);
    if (width === 'i16') return v.getInt16(at, true);
    if (width === 'u32') return v.getUint32(at, true);
    if (width === 'i32') return v.getInt32(at, true);
    if (width === 'f32') return v.getFloat32(at, true);
    return v.getFloat64(at, true);
  }

  varint(): number {
    let n = 0;
    let scale = 1;
    for (let i = 0; i < VARINT_BYTES; i++) {
      const b = this.view.getUint8(this.take(1));
      n += (b & 127) * scale;
      if ((b & 128) === 0) return n;
      scale *= 128;
    }
    throw new RangeError(`binary body: a varint longer than ${VARINT_BYTES} bytes`);
  }

  date(): Date {
    const low = this.num('u32');
    return new Date(this.num('i16') * TWO_32 + low);
  }

  str(): string {
    const bytes = this.raw(this.varint());
    try {
      return this.text.decode(bytes);
    } catch {
      throw new RangeError('binary body: a str that is not UTF-8');
    }
  }

  raw(count: number): Uint8Array {
    const at = this.take(count);
    return this.input.subarray(at, at + count);
  }

  claim(bits: number): void {
    if (bits > (this.input.length - this.offset) * 8) {
      throw new RangeError('binary body: a count longer than what is left');
    }
  }
}
