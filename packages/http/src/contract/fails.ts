/**
 * The `fails` of a function or a middleware (SDD-60 §3.3): named rejections the handler throws,
 * `throw SaveFails.reserved()`, each with the status and the `detail` its declaration wrote.
 */

import { HttpError } from '../errors.js';

const TITLES: Readonly<Record<number, string>> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  402: 'Payment Required',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  406: 'Not Acceptable',
  408: 'Request Timeout',
  409: 'Conflict',
  410: 'Gone',
  412: 'Precondition Failed',
  413: 'Content Too Large',
  415: 'Unsupported Media Type',
  422: 'Unprocessable Content',
  423: 'Locked',
  428: 'Precondition Required',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  501: 'Not Implemented',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
};

/** The standard name of a status, or the class it belongs to. */
export const titleOf = (status: number): string => TITLES[status] ?? (status < 500 ? 'Client Error' : 'Server Error');

/** `{ reserved: [409, 'That name is reserved.'] }` → `{ reserved(): HttpError }`. */
export function fails<K extends string>(
  table: Readonly<Record<K, readonly [status: number, detail?: string]>>,
): Readonly<Record<K, () => HttpError>> {
  const out = {} as Record<K, () => HttpError>;
  for (const [code, [status, detail]] of Object.entries(table) as [K, readonly [number, string?]][]) {
    out[code] = () => new HttpError({ status, title: titleOf(status), ...(detail !== undefined ? { detail } : {}) });
  }
  return out;
}
