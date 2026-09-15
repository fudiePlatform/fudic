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
import type { LayoutResolver } from './layout-resolver.js';
import { componentModuleSpecifier, serverFileName } from './paths.js';
import type { VirtualFile } from './types.js';
import { VirtualWriter } from './writer.js';

/** What the route's `layout(ctx, data)` is checked against (SDD-40 §4.7). */
const LAYOUT_PROPS = '$LayoutProps';

/** The layout this file declares, and where its resolver takes a return type. */
export interface LayoutContract {
  /** The `href` of the `<link rel="layout">` — the module `$Props` is imported from. */
  readonly href: string;
  /** The route's `export … layout`, when it has one the projection can annotate. */
  readonly resolver: LayoutResolver | undefined;
}

/**
 * Emit `<name>.fud.server.ts` from the file's `@code`.
 *
 * The neutral zone is duplicated here and in the client virtual on purpose (§4.1); the client
 * one is canonical, and `USER_ECHO_CAPS` is how this copy says so.
 */
export function emitServerVirtual(
  source: string,
  fudPath: string,
  code: CodeBlockNode | undefined,
  layout?: LayoutContract,
): VirtualFile {
  const { neutral, server } = partitionCode(code);
  const w = new VirtualWriter(source);
  // The layout's contract, imported the way every other one is: `import type`, `$` namespace,
  // and only when this file has something to check against it (SDD-23 §4.4).
  const annotateAt = layout?.resolver?.annotateAt;
  if (layout !== undefined && annotateAt !== undefined) {
    w.scaffold(
      `import type { $Props as ${LAYOUT_PROPS} } from '${componentModuleSpecifier(layout.href)}';\n`,
    );
  }

  // The neutral zone belongs to the client virtual (`USER_ECHO_CAPS`): it lives in both files,
  // and with two projections answering the same offset the editor shows the answer twice —
  // hover concatenates it, completion lists it. Only navigation still routes from here, which
  // is what lets the `@server` region below jump to a name declared up there.
  for (const chunk of neutral) {
    w.copy(chunk, USER_ECHO_CAPS);
    w.scaffold('\n');
  }
  for (const region of server) {
    // The route's `layout(ctx, data)` gets the return type it never wrote, spliced into the
    // author's own text so `TS2739` lands on the author's own `return { … }` (SDD-40 §4.7).
    // A synthetic assignment beside it would report on the synthetic assignment, which maps
    // to nothing anyone can see — the exact failure `contract.ts` describes for props.
    if (annotateAt !== undefined && annotateAt > region.start && annotateAt <= region.end) {
      w.copy({ start: region.start, end: annotateAt });
      w.scaffold(`: ${LAYOUT_PROPS} | Promise<${LAYOUT_PROPS}>`);
      w.copy({ start: annotateAt, end: region.end });
    } else {
      w.copy(region);
    }
    w.scaffold('\n');
  }

  // Unconditional: it costs one line and guarantees the file is a module. A file with no
  // import and no export is a global script, and `typeof import(...)` over a script is not
  // the same type — the degradation above would stop working exactly in the empty case it
  // exists for.
  w.scaffold('export {};\n');

  return w.build(serverFileName(fudPath), 'typescript');
}
