/**
 * Where the public explanation of every code lives. The address is read from this package's
 * `package.json` (`fudic.docs`) and never written in code: each deployment changes it there.
 */

import pkg from '../package.json' with { type: 'json' };
import type { FudCode } from './types.js';

/** The base address of the explanations; a code goes in its `code` query parameter. */
export const DOCS_BASE: string = pkg.fudic.docs;

/**
 * The public explanation of one code: `${DOCS_BASE}?code=FUD0050`. A query parameter, not an
 * anchor: the page is rendered on the server, and an anchor never reaches it.
 */
export function docsUrl(code: FudCode): string {
  return `${DOCS_BASE}?code=${code}`;
}
