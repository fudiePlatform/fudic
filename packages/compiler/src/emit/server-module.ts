/**
 * The `?server` module of a `.fud` (SDD-19 §4.3, SDD-56 §4.13): what the server imports of the
 * file to run `load`, `paths`, `layout` and its server functions.
 *
 * - **A route** gets its whole `@server`.
 * - **A component** gets its machinery alone — its functions, `http`, its bases and middlewares —
 *   since the rest of its `@server` runs inside `render()`.
 *
 * Both get the imports those statements read, the neutral zone's included: a form both ends
 * import is written there, and `.form(userForm)` reads it. TypeScript is kept; stripping it is
 * the bundler's job.
 */

import { parseDocument } from '../html/index.js';
import { atConstructs } from '../constructs.js';
import { structureDocument } from '../document/index.js';
import { codeOfDocument, type CodeDocument } from './oxc-code.js';

const EMPTY = 'export {};\n';

/** The `?server` module text of a `.fud` source. */
export function emitServerModule(source: string): string {
  const html = parseDocument(source, { atConstructs });
  const doc = structureDocument(source, html.value).value;
  if (doc.type !== 'page-document' && doc.type !== 'route-document' && doc.type !== 'component-document') {
    return EMPTY;
  }
  if (doc.code === undefined) return EMPTY;
  const { imports, body } = codeOfDocument(source, doc as CodeDocument).serverModule;
  if (body.length === 0) return EMPTY;
  return `${[...imports, ...body.map((s) => s.text)].join('\n')}\n`;
}
