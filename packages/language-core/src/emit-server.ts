/**
 * The server virtual file: neutral zone + `@server` region (SDD-23 §4.1, §4.2).
 *
 * It is emitted for EVERY `.fud`, even one with no `@server` at all. The client virtual
 * derives its `data` from `typeof import('./x.fud.server')['load']`; if the file did not
 * exist, that line would fail with `TS2307 cannot find module` — an error about
 * scaffolding the user never wrote, with no useful span in the source. With the file
 * always present but empty, `['load']` simply does not resolve, `$Data` degrades to
 * `unknown`, and every use of `data` fails **inside the template**, which is the
 * diagnostic the user can act on.
 */

import type { CodeBlockNode } from '@fudic/compiler';
import { USER_ECHO_CAPS } from './caps.js';
import { partitionCode } from './code.js';
import { serverFileName } from './paths.js';
import type { VirtualFile } from './types.js';
import { VirtualWriter } from './writer.js';

/**
 * Emit `<name>.fud.server.ts` from the file's `@code`.
 *
 * The neutral zone is duplicated here and in the client virtual on purpose (§4.1); the
 * duplicate diagnostics that follow are deduplicated by the server against the client
 * virtual, which is the canonical one.
 */
export function emitServerVirtual(
  source: string,
  fudPath: string,
  code: CodeBlockNode | undefined,
): VirtualFile {
  const { neutral, server } = partitionCode(code);
  const w = new VirtualWriter(source);

  // The neutral zone is the client virtual's for completion (`USER_ECHO_CAPS`): it lives in
  // both files, and with two projections answering the same offset the editor would show
  // every identifier twice. Everything else about it still routes from here.
  for (const chunk of neutral) {
    w.copy(chunk, USER_ECHO_CAPS);
    w.scaffold('\n');
  }
  for (const region of server) {
    w.copy(region);
    w.scaffold('\n');
  }

  // Unconditional: it costs one line and guarantees the file is a module. A file with no
  // import and no export is a global script, and `typeof import(...)` over a script is not
  // the same type — the degradation above would stop working exactly in the empty case it
  // exists for.
  w.scaffold('export {};\n');

  return w.build(serverFileName(fudPath), 'typescript');
}
