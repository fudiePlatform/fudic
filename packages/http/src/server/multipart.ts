/**
 * A `multipart/form-data` body read as it arrives (SDD-81 §4.4), on any runtime: a
 * `ReadableStream` in, its parts out, one after the other, each with its body as a stream that
 * ends at the next boundary.
 *
 * Why not `request.formData()`: on Node it gathers the whole body in memory before handing over
 * a single byte, and a server that must stop at a limit, or send a file to disk, needs the bytes
 * as they come.
 *
 * The boundary is searched with Boyer-Moore-Horspool over a window that crosses the chunks: what
 * cannot be the start of a boundary goes out at once, and only the last `boundary.length - 1`
 * bytes wait for the next chunk. A part is not read until the one before it is done: asking for
 * the next part skips whatever its body left unread.
 *
 * Anything malformed is a `400` whose `detail` starts with `multipart body:`.
 */

import { badRequest, type HttpError } from '../errors.js';

/** What the headers of a part say. */
export interface PartHead {
  /** `name` of its `content-disposition`. */
  readonly name: string;
  /** `filename` (or `filename*`, in UTF-8): present for a file, even an empty one. */
  readonly filename?: string;
  /** Its `content-type`; `text/plain` when it says none (RFC 7578 §4.4). */
  readonly type: string;
}

export interface Part extends PartHead {
  readonly body: ReadableStream<Uint8Array>;
}

/** The most a part's header block may take. Nothing legitimate comes close. */
const MAX_HEAD = 16 * 1024;

const malformed = (detail: string): HttpError => badRequest(`multipart body: ${detail}`);

/** The `boundary` of a `multipart/form-data` content type, or `undefined`. */
export function boundaryOf(contentType: string | null): string | undefined {
  if (contentType === null) return undefined;
  const [type, ...params] = splitParams(contentType);
  if (type.toLowerCase() !== 'multipart/form-data') return undefined;
  const boundary = params.find(([key]) => key === 'boundary')?.[1];
  // RFC 2046 §5.1.1: 1 to 70 characters.
  return boundary !== undefined && boundary.length >= 1 && boundary.length <= 70 ? boundary : undefined;
}

/** `form-data; name="a"; filename="b"` → `['form-data', ['name', 'a'], ['filename', 'b']]`. */
function splitParams(value: string): [string, ...(readonly [string, string])[]] {
  const out: (readonly [string, string])[] = [];
  let i = value.indexOf(';');
  const head = (i === -1 ? value : value.slice(0, i)).trim();
  while (i !== -1 && i < value.length) {
    let j = i + 1;
    while (value[j] === ' ' || value[j] === '\t') j++;
    const eq = value.indexOf('=', j);
    if (eq === -1) break;
    const key = value.slice(j, eq).trim().toLowerCase();
    let k = eq + 1;
    let text = '';
    if (value[k] === '"') {
      k++;
      while (k < value.length && value[k] !== '"') {
        if (value[k] === '\\' && k + 1 < value.length) k++;
        text += value[k];
        k++;
      }
      k++;
    } else {
      const end = value.indexOf(';', k);
      text = (end === -1 ? value.slice(k) : value.slice(k, end)).trim();
      k = end === -1 ? value.length : end;
    }
    out.push([key, text]);
    i = value.indexOf(';', k);
  }
  return [head, ...out];
}

/** `UTF-8''n%C3%BAmero.png` (RFC 8187) as its text, or `undefined`. */
function extended(value: string): string | undefined {
  const match = /^utf-8'[^']*'(.*)$/iu.exec(value);
  if (match === null) return undefined;
  try {
    return decodeURIComponent(match[1]!);
  } catch {
    return undefined;
  }
}

/** The head of a part out of its header block. */
function headOf(block: string): PartHead {
  let disposition: string | undefined;
  let type = 'text/plain';
  for (const line of block.split('\r\n')) {
    const colon = line.indexOf(':');
    if (colon === -1) throw malformed('a header line without a colon');
    const name = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (name === 'content-disposition') disposition = value;
    else if (name === 'content-type') type = value;
  }
  if (disposition === undefined) throw malformed('a part without content-disposition');
  const [kind, ...params] = splitParams(disposition);
  if (kind.toLowerCase() !== 'form-data') throw malformed(`a part that is not form-data (${kind})`);
  const get = (key: string): string | undefined => params.find(([k]) => k === key)?.[1];
  const name = get('name');
  if (name === undefined) throw malformed('a part without a name');
  const star = get('filename*');
  const filename = (star === undefined ? undefined : extended(star)) ?? get('filename');
  return filename === undefined ? { name, type } : { name, filename, type };
}

/** Boyer-Moore-Horspool over `haystack` from `from`: where `needle` starts, or -1. */
function search(haystack: Uint8Array, needle: Uint8Array, shift: Uint32Array, from: number): number {
  const last = needle.length - 1;
  let i = from;
  while (i + last < haystack.length) {
    let j = last;
    while (j >= 0 && haystack[i + j] === needle[j]) j--;
    if (j < 0) return i;
    i += shift[haystack[i + last]!]!;
  }
  return -1;
}

function shiftTable(needle: Uint8Array): Uint32Array {
  const shift = new Uint32Array(256).fill(needle.length);
  for (let i = 0; i < needle.length - 1; i++) shift[needle[i]!] = needle.length - 1 - i;
  return shift;
}

const concat = (a: Uint8Array, b: Uint8Array): Uint8Array => {
  if (a.length === 0) return b;
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
};

const CRLF2 = new Uint8Array([13, 10, 13, 10]);
const CRLF2_SHIFT = shiftTable(CRLF2);

/**
 * The parts of `body`, as they arrive. Ask for the next part only once you are done with the
 * body of the one before: whatever it left unread is skipped then.
 */
export async function* readParts(body: ReadableStream<Uint8Array>, boundary: string): AsyncGenerator<Part, void, undefined> {
  const reader = body.getReader();
  const encoder = new TextEncoder();
  // Every boundary after the first comes after a line break; the first may open the body.
  const delimiter = encoder.encode(`\r\n--${boundary}`);
  const shift = shiftTable(delimiter);
  // The first one is searched with a line break in front, as if the body began with one.
  let buf: Uint8Array = new Uint8Array([13, 10]);
  let ended = false;

  /** One more chunk into `buf`; `false` when the body has no more. */
  const more = async (): Promise<boolean> => {
    if (ended) return false;
    const { done, value } = await reader.read();
    if (done) {
      ended = true;
      return false;
    }
    buf = concat(buf, value);
    return true;
  };

  /** The bytes of the current part's body up to the next boundary, in pieces; `null` at its end. */
  let open = false;
  const piece = async (): Promise<Uint8Array | null> => {
    while (open) {
      const at = search(buf, delimiter, shift, 0);
      if (at !== -1) {
        const out = buf.subarray(0, at);
        buf = buf.subarray(at + delimiter.length);
        open = false;
        if (out.length > 0) return out;
        return null;
      }
      // What cannot be the start of a boundary goes out now.
      const safe = buf.length - (delimiter.length - 1);
      if (safe > 0) {
        const out = buf.subarray(0, safe);
        buf = buf.subarray(safe);
        return out;
      }
      if (!(await more())) throw malformed('the body ends inside a part');
    }
    return null;
  };

  try {
    // The preamble, up to the first boundary.
    for (;;) {
      const at = search(buf, delimiter, shift, 0);
      if (at !== -1) {
        buf = buf.subarray(at + delimiter.length);
        break;
      }
      buf = buf.subarray(Math.max(0, buf.length - (delimiter.length - 1)));
      if (!(await more())) throw malformed('no boundary');
    }
    for (;;) {
      // After a boundary: `--` closes the body, a line break opens a part (spaces may pad it).
      while (buf.length < 2 && (await more()));
      if (buf[0] === 45 && buf[1] === 45) return;
      let i = 0;
      for (;;) {
        while (i >= buf.length - 1 && (await more()));
        if (buf[i] === 32 || buf[i] === 9) i++;
        else break;
      }
      if (buf[i] !== 13 || buf[i + 1] !== 10) throw malformed('a boundary not followed by a line break');
      buf = buf.subarray(i + 2);
      // The header block, up to an empty line.
      let end = search(buf, CRLF2, CRLF2_SHIFT, 0);
      while (end === -1) {
        if (buf.length > MAX_HEAD) throw malformed('a header block too long');
        if (!(await more())) throw malformed('the body ends inside the headers of a part');
        end = search(buf, CRLF2, CRLF2_SHIFT, 0);
      }
      if (end > MAX_HEAD) throw malformed('a header block too long');
      const head = headOf(new TextDecoder().decode(buf.subarray(0, end)));
      buf = buf.subarray(end + 4);
      open = true;
      const stream = new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const out = await piece();
            if (out === null) controller.close();
            else controller.enqueue(out.slice());
          } catch (error) {
            controller.error(error);
          }
        },
      });
      yield { ...head, body: stream };
      // Whatever its body left unread.
      while ((await piece()) !== null);
    }
  } finally {
    reader.releaseLock();
  }
}
