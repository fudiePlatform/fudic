/**
 * The functions and forms of the `.fudapi` a file links, as the browser side sees them (SDD-60
 * §4.7): each one typed by its module, `fudic:<id>`, whose browser variant the build imports.
 */

import type { ServerImport } from './types.js';
import type { VirtualWriter } from './writer.js';

/**
 * Declare each name as its module types it: the browser calls the same stub. A name two files
 * give is declared once — `FUD1113` is the build's to say.
 */
export function emitServerImports(w: VirtualWriter, servers: readonly ServerImport[]): void {
  const seen = new Set<string>();
  for (const server of servers) {
    for (const name of server.names) {
      if (seen.has(name)) continue;
      seen.add(name);
      w.scaffold(`declare const ${name}: typeof import('fudic:${server.id}')['${name}'];\n`);
    }
  }
}
