/**
 * The runtime emitter, run over a `.fud` in memory (acceptance criterion 3).
 *
 * The emit is what turns a `.fud` into the DOM a browser builds, and every whitespace the
 * author wrote reaches it VERBATIM — `emit/markup.ts` produces `$dom.text("\n    ")`. That
 * is why criterion 3 cannot be a byte comparison of the two emits: any reindent changes it,
 * and no formatter in the world would pass.
 *
 * What CAN be compared, and is exactly the property that matters, is the emit with every
 * whitespace RUN collapsed to a single space. HTML collapses runs wherever whitespace is
 * significant, so a rewritten run is invisible to the render and to this comparison alike;
 * a run that appears where there was none, or vanishes where there was one, is not — the
 * empty string does not collapse to a space. That is the printer's invariant, measured on
 * the far side of the compiler.
 *
 * The comparison is over the STATIC TEXT the emitter bakes into the module, and over the
 * calls that build the tree. Not over the module's own source: the JS of `@code`, the
 * interpolated expressions and the CSS are delegated to formatters that legitimately
 * rewrite them, and they reach the page by being executed, not by being read.
 */

import { dirname, resolve as resolvePath } from 'node:path';
import {
  emitComponentModule,
  emitLayoutModule,
  emitPageModule,
  emitRouteModule,
  resolveDocument,
  type ResolveIo,
} from '@fudic/compiler';

/** Read `.fud` sources from disk, except the one under test, which is supplied. */
export function ioWith(path: string, source: string, read: (p: string) => string): ResolveIo {
  return {
    read: (p) => (p === path ? source : read(p)),
    resolve: (from, href) => resolvePath(dirname(from), href),
  };
}

/**
 * The emitted module for a `.fud`, whatever role it plays.
 *
 * A component or a layout is normally emitted as somebody else's dependency, so the entry
 * is wrapped into the shape its emitter expects. The alternative — testing components only
 * through a page that happens to link them — would leave half the corpus unmeasured.
 */
export function emitModule(path: string, source: string, read: (p: string) => string): string {
  const io = ioWith(path, source, read);
  const graph = resolveDocument(path, io).value;
  const entry = graph.entry;

  if (entry.type === 'page-document') return emitPageModule(graph);
  if (entry.type === 'route-document') return emitRouteModule(graph);
  if (entry.type === 'layout-document') {
    return emitLayoutModule(graph, {
      path,
      source: graph.entrySource,
      doc: entry,
      deps: graph.entryDeps,
    });
  }
  return emitComponentModule(graph, {
    tag: entry.name,
    path,
    source: graph.entrySource,
    doc: entry,
    deps: graph.entryDeps,
  });
}

const TEXT_CALL = /\$dom\.text\((".*?(?<!\\)")\)/gu;
const BUILD_CALL = /\$dom\.(element|attachShadow)\("([^"]*)"/gu;
const ATTR_CALL = /\$dom\.setAttr\(\$n\d+, '([^']*)'/gu;

/**
 * What the emit says about the DOM, with the runs collapsed.
 *
 * Three sequences, in source order: the static text nodes, the elements built, and the
 * attributes set. Everything else in the module is code that will be executed.
 */
export function domSignature(module: string): readonly string[] {
  const out: string[] = [];
  const collapse = (literal: string): string =>
    (JSON.parse(literal) as string).replace(/\s+/gu, ' ');

  for (const match of module.matchAll(TEXT_CALL)) out.push(`text:${collapse(match[1]!)}`);
  for (const match of module.matchAll(BUILD_CALL)) out.push(`${match[1]!}:${match[2]!}`);
  for (const match of module.matchAll(ATTR_CALL)) out.push(`attr:${match[1]!}`);
  return out;
}

/**
 * The static text of the emit, run-collapsed, in order.
 *
 * Separated from the rest because it is the half no other criterion can see: the AST
 * round-trip and the idempotence are both blind to whitespace, which is the whole reason
 * this criterion exists.
 */
export function textSignature(module: string): readonly string[] {
  return domSignature(module).filter((entry) => entry.startsWith('text:'));
}
