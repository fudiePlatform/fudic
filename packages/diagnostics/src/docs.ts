/**
 * Where the public explanation of every code lives. The address is read from this package's
 * `package.json` (`fudic.docs`) and never written in code: each deployment changes it there.
 */

import pkg from '../package.json' with { type: 'json' };
import type { FudCode } from './types.js';

/** The base address of the explanations; each code has its page below it. */
export const DOCS_BASE: string = pkg.fudic.docs;

/**
 * The public explanation of one code: `${DOCS_BASE}/FUD0050`. A path, not an anchor: the page is
 * rendered on the server, and an anchor never reaches it.
 */
export function docsUrl(code: FudCode): string {
  return `${DOCS_BASE}/${code}`;
}
