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

import type { CodeBlockNode, Span } from '@fudic/compiler';
import { USER_ECHO_CAPS } from './caps.js';
import { partitionCode } from './code.js';
import type { LayoutResolver } from './layout-resolver.js';
import { componentModuleSpecifier, serverFileName } from './paths.js';
import type { VirtualFile } from './types.js';
import { VirtualWriter } from './writer.js';

/** What the route's `layout(ctx, data)` is checked against (SDD-40 §4.7). */
const LAYOUT_PROPS = '$LayoutProps';

/**
 * The half of the resolver's `ctx` that comes from dependency injection: `inject`, and only
 * `inject`. A culture may come out of a service, so the resolver may ask for one; it has no
 * business PUBLISHING anything, since what it resolves are bindings of the head and never
 * reach the browser as state.
 *
 * Typed off `@fudic/di` by an `import()` type and not by an import statement, and here rather
 * than in the globals: a project without that package gets an unresolved type — `inject`
 * degrades to answering `unknown` — reported on scaffolding nobody can see, instead of an
 * error in a file every `.fud` shares.
 */
const LAYOUT_INJECT_TYPE =
  `type $LayoutInject = {\n` +
  `  inject<T>(provider: import('@fudic/di').Provider<T>): T;\n` +
  `  inject<T>(provider: import('@fudic/di').Provider<T>, options: import('@fudic/di').InjectOptions): T | undefined;\n` +
  `};\n`;

/** The layout this file declares, and where its resolver takes the types it lacks. */
export interface LayoutContract {
  /** The `href` of the `<link rel="layout">` — the module `$Props` is imported from. */
  readonly href: string;
  /** The route's `export … layout`, when it has one the projection can annotate. */
  readonly resolver: LayoutResolver | undefined;
  /** The route's params, read off its file name: what `ctx.params` carries. */
  readonly params: readonly string[];
  /** Whether the route exports `load` — without it, `data` is the empty object. */
  readonly hasLoad: boolean;
}

/** One type spliced into the author's text, just past `at`. */
interface Splice {
  readonly at: number;
  readonly text: string;
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
  if (layout?.resolver?.annotateAt !== undefined) {
    w.scaffold(
      `import type { $Props as ${LAYOUT_PROPS} } from '${componentModuleSpecifier(layout.href)}';\n`,
    );
  }
  if (layout?.resolver?.ctxAt !== undefined) w.scaffold(LAYOUT_INJECT_TYPE);

  // The neutral zone belongs to the client virtual (`USER_ECHO_CAPS`): it lives in both files,
  // and with two projections answering the same offset the editor shows the answer twice —
  // hover concatenates it, completion lists it. Only navigation still routes from here, which
  // is what lets the `@server` region below jump to a name declared up there.
  for (const chunk of neutral) {
    w.copy(chunk, USER_ECHO_CAPS);
    w.scaffold('\n');
  }
  const splices = layout === undefined ? [] : resolverSplices(layout);
  for (const region of server) {
    copyWithSplices(w, region, splices);
    w.scaffold('\n');
  }

  // Unconditional: it costs one line and guarantees the file is a module. A file with no
  // import and no export is a global script, and `typeof import(...)` over a script is not
  // the same type — the degradation above would stop working exactly in the empty case it
  // exists for.
  w.scaffold('export {};\n');

  return w.build(serverFileName(fudPath), 'typescript');
}

/**
 * The types the route's `layout(ctx, data)` is missing, in source order.
 *
 * The return type is spliced into the author's own text so `TS2739` lands on the author's own
 * `return { … }` (SDD-40 §4.7): a synthetic assignment beside it would report on the synthetic
 * assignment, which maps to nothing anyone can see. The parameter types are spliced for what
 * they OFFER — `ctx.` lists the context, `data.` lists what `load` brought (BUG-44).
 */
function resolverSplices(layout: LayoutContract): readonly Splice[] {
  const { resolver } = layout;
  if (resolver === undefined) return [];
  const params = layout.params.map((name) => `'${name}'`).join(' | ') || 'never';
  // `load` is in scope: it is exported from this same region. With no `load` the runtime
  // hands over the empty object, and saying so is what makes `data.x` an error here too.
  const data = layout.hasLoad ? 'Awaited<ReturnType<typeof load>>' : 'Record<string, never>';
  const out: Splice[] = [];
  if (resolver.ctxAt !== undefined) {
    out.push({ at: resolver.ctxAt, text: `: $LayoutContext<${params}> & $LayoutInject` });
  }
  if (resolver.dataAt !== undefined) out.push({ at: resolver.dataAt, text: `: ${data}` });
  if (resolver.annotateAt !== undefined) {
    const props = resolver.async ? `Promise<${LAYOUT_PROPS}>` : LAYOUT_PROPS;
    out.push({ at: resolver.annotateAt, text: `: ${props}` });
  }
  return out;
}

/** Copy `region`, splicing in every type whose point falls inside it. */
function copyWithSplices(w: VirtualWriter, region: Span, splices: readonly Splice[]): void {
  let from = region.start;
  for (const splice of splices) {
    if (splice.at <= region.start || splice.at > region.end) continue;
    w.copy({ start: from, end: splice.at });
    w.scaffold(splice.text);
    from = splice.at;
  }
  w.copy({ start: from, end: region.end });
}
