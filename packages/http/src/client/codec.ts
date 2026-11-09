/**
 * What comes back from a call, as a value or as the error it was on the server (SDD-56 §4.7,
 * step 4; SDD-67 §4.1, step 5). Both are read with the function's own format; a problem in JSON
 * is read too, without its codec, since a URL that names no function answers in JSON to whoever
 * asks for it.
 */

import { CODE_HEADER, HttpError, Redirect, ValidationError, type Problem } from '../errors.js';
import { conform } from '../contract/wire.js';
import { joinValue, VALUE_PART } from '../wire/files.js';
import type { Ty } from '../wire/ty.js';
import type { Wire } from '../wire/wire.js';

/** What `decode` needs of a function. */
export interface Returns {
  readonly wire: Wire;
  readonly returns?: Ty;
  /** The text of each `fails` code in the language of the page (SDD-74): what a problem with that code says. */
  readonly fails?: Readonly<Record<string, string>>;
}

const JSON_PROBLEM = 'application/problem+json';

/** The same class the server threw, rebuilt from the `Problem` it sent. */
export function fromProblem(problem: Problem): HttpError {
  if (problem.status === 422) return new ValidationError(problem);
  if (problem.location !== undefined && problem.status >= 300 && problem.status < 400) {
    return new Redirect({ ...problem, location: problem.location });
  }
  return new HttpError(problem);
}

const bytesOf = async (response: Response): Promise<Uint8Array> => new Uint8Array(await response.arrayBuffer());

/** A 2xx is the value (`undefined` for a 204 or a function without `->`); anything else is thrown. */
export async function decode(response: Response, spec: Returns): Promise<unknown> {
  if (response.ok) {
    if (response.status === 204 || spec.returns === undefined) return undefined;
    const type = (response.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
    // `-> file`: the body is the file (SDD-81 §3.3).
    if (isFileType(spec.returns)) return fileOf(response);
    // A value that carries files: `$value`, then its files in their places.
    if (type === 'multipart/form-data') return valueWithFiles(response, spec.returns, spec.wire);
    return spec.wire.decodeValue(spec.returns, await bytesOf(response));
  }
  const problem = await problemOf(response, spec.wire);
  // The server names the failure by its code; the words are the page's, in its language.
  const code = response.headers.get(CODE_HEADER) ?? undefined;
  const text = code !== undefined && spec.fails !== undefined && Object.hasOwn(spec.fails, code) ? spec.fails[code] : undefined;
  const coded = code === undefined ? problem : { ...problem, code };
  throw fromProblem(text === undefined ? coded : { ...coded, detail: text });
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
  return new File([await response.blob()], filenameOf(response.headers.get('content-disposition')), {
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

/** The body of a failed response by its type, or a `Problem` made of its status when it is neither. */
async function problemOf(response: Response, wire: Wire): Promise<Problem> {
  const type = (response.headers.get('content-type') ?? '').split(';')[0]!.trim();
  try {
    if (type === wire.problemType) return wire.decodeProblem(await bytesOf(response));
    if (type === JSON_PROBLEM) return (await response.json()) as Problem;
  } catch {
    // A body that says it is a problem and is not one: as if it carried nothing.
  }
  return { status: response.status, title: response.statusText };
}
