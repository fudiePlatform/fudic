/**
 * Where the public explanation of every code lives. The address is read from this package's
 * `package.json` (`fudic.docs`) and never written in code: each deployment changes it there.
 */

import pkg from '../package.json' with { type: 'json' };
import type { FudCode } from './types.js';

/** The base address of the explanations; a code's anchor is appended to it. */
export const DOCS_BASE: string = pkg.fudic.docs;

/** The public explanation of one code: `${DOCS_BASE}#FUD0050`. */
export function docsUrl(code: FudCode): string {
  return `${DOCS_BASE}#${code}`;
}
