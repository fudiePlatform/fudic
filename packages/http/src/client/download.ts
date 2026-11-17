/**
 * What comes back from a function whose `->` reaches a `file` (SDD-81 §3.3): the body as the
 * file, or a multipart value with its files put back in their places. A capability the generated
 * module hands to `stub` only for such a function.
 */

import { HttpError } from '../errors.js';
import { conform } from '../contract/wire.js';
import { joinValue, VALUE_PART } from '../wire/files.js';
import type { Ty } from '../wire/ty.js';
import type { Wire } from '../wire/wire.js';

/** What `decode` needs to read a value that carries files. */
export interface Download {
  /** The value of a 2xx, or `undefined` when this response is not one that carries files. */
  read(response: Response, returns: Ty, wire: Wire): Promise<unknown> | undefined;
}

/** `file` or `file?`: the response is the file. */
const isFileType = (ty: Ty): boolean => ty === 'file' || (typeof ty !== 'string' && 'opt' in ty && isFileType(ty.opt));

/** The name in `content-disposition`: `filename*` (RFC 8187) first, then `filename`; `''` with none. */
export function filenameOf(disposition: string | null): string {
  if (disposition === null) return '';
  const star = /filename\*\s*=\s*(?:utf-8|UTF-8)'[^']*'([^;]+)/u.exec(disposition)?.[1];
  if (star !== undefined) {
    try {
      return decodeURIComponent(star.trim());
    } catch {
      // A name that does not decode: the plain one, if there is one.
    }
  }
  return /filename\s*=\s*"?([^";]*)"?/u.exec(disposition)?.[1] ?? '';
}

/** The body as a `File`, with the name, type and date its headers give. */
async function fileOf(response: Response): Promise<File> {
  const modified = response.headers.get('last-modified');
  const lastModified = modified === null ? Number.NaN : Date.parse(modified);
  // The bytes, not a `Blob`: a `Blob` of another implementation would be text to this `File`.
  return new File([await response.arrayBuffer()], filenameOf(response.headers.get('content-disposition')), {
    type: response.headers.get('content-type') ?? '',
    ...(Number.isNaN(lastModified) ? {} : { lastModified }),
  });
}

/** A multipart value: `$value` read in the function's format, each file put back where its part says. */
async function valueWithFiles(response: Response, returns: Ty, wire: Wire): Promise<unknown> {
  const form = await response.formData();
  const value = form.get(VALUE_PART);
  if (!(value instanceof Blob)) throw new HttpError({ status: 502, title: 'Bad Gateway', detail: `a multipart value without ${VALUE_PART}` });
  const parts = new Map<string, File>();
  for (const [name, part] of form) {
    if (name !== VALUE_PART && part instanceof File) parts.set(name, part);
  }
  const rest = wire.decodeRest(returns, new Uint8Array(await value.arrayBuffer()));
  return conform(returns, joinValue(returns, rest, parts), 'value');
}

export const download: Download = {
  read(response, returns, wire) {
    if (isFileType(returns)) return fileOf(response);
    const type = (response.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
    return type === 'multipart/form-data' ? valueWithFiles(response, returns, wire) : undefined;
  },
};
