/**
 * `serve` in `fudic.json` (SDD-81 §3.5, §3.12): how the app is served, wherever it is — whether a
 * proxy in front is trusted for the public URL, and the limits of a call that carries files.
 *
 * Every field is optional, and absent means the server's default. A field with the wrong shape is
 * `FUD1488`, naming it: a typo that kept a default without a word would be found in production.
 */

import { FUD1488, type FileDiagnostic, type Span } from '@fudic/diagnostics';
import { CONFIG_FILE } from './constants.js';

/** The limits of a call that carries files, in bytes and files. */
export interface UploadsConfig {
  readonly maxFileSize?: number;
  readonly maxFiles?: number;
  readonly maxArgs?: number;
}

export interface ServeConfig {
  /** Read `Forwarded` / `X-Forwarded-*` for the public URL. */
  readonly trustProxy?: boolean;
  readonly uploads?: UploadsConfig;
}

const UNITS: Readonly<Record<string, number>> = { kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 };

/**
 * A size as bytes: a whole number, or text with a unit stuck to it (`"50mb"`, `"1.5gb"`, base
 * 1024), rounded down to a whole byte. `undefined` for anything else.
 */
export function sizeOf(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
  if (typeof value !== 'string') return undefined;
  const match = /^(\d+(?:\.\d+)?)(kb|mb|gb)?$/u.exec(value.trim().toLowerCase());
  if (match === null) return undefined;
  return Math.floor(Number(match[1]) * (match[2] === undefined ? 1 : UNITS[match[2]]!));
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** `serve` of `fields`, with what is wrong in it pushed to `diagnostics`. */
export function readServe(
  fields: Record<string, unknown>,
  diagnostics: FileDiagnostic[],
  spanOf: (field: string) => Span | undefined,
): ServeConfig {
  const value = fields['serve'];
  if (value === undefined) return {};
  const wrong = (field: string, expected: string): void => {
    const span = spanOf(field.slice(field.lastIndexOf('.') + 1));
    diagnostics.push(FUD1488({ file: CONFIG_FILE, field, expected, ...(span === undefined ? {} : { span }) }));
  };
  if (!isObject(value)) {
    wrong('serve', 'an object');
    return {};
  }
  let trustProxy: boolean | undefined;
  let uploads: UploadsConfig | undefined;
  for (const [key, field] of Object.entries(value)) {
    if (key === 'trustProxy') {
      if (typeof field === 'boolean') trustProxy = field;
      else wrong('serve.trustProxy', 'true or false');
    } else if (key === 'uploads') {
      uploads = readUploads(field, wrong);
    } else {
      wrong(`serve.${key}`, 'a known key: trustProxy or uploads');
    }
  }
  return { ...(trustProxy !== undefined ? { trustProxy } : {}), ...(uploads !== undefined ? { uploads } : {}) };
}

function readUploads(value: unknown, wrong: (field: string, expected: string) => void): UploadsConfig | undefined {
  if (!isObject(value)) {
    wrong('serve.uploads', 'an object');
    return undefined;
  }
  const out: { maxFileSize?: number; maxFiles?: number; maxArgs?: number } = {};
  for (const [key, field] of Object.entries(value)) {
    if (key === 'maxFileSize' || key === 'maxArgs') {
      const size = sizeOf(field);
      if (size === undefined) wrong(`serve.uploads.${key}`, 'a size: bytes, or text such as "50mb"');
      else out[key] = size;
    } else if (key === 'maxFiles') {
      if (typeof field === 'number' && Number.isSafeInteger(field) && field >= 0) out.maxFiles = field;
      else wrong('serve.uploads.maxFiles', 'a whole number');
    } else {
      wrong(`serve.uploads.${key}`, 'a known key: maxFileSize, maxFiles or maxArgs');
    }
  }
  return out;
}
