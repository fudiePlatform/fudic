/**
 * The two hosts of a localized compile (SDD-58 §3.3, §4.6): the files a `.fud` graph reads, and
 * a `.ts`/`.js` module of the app.
 */

import { parseSync } from 'oxc-parser';
import { FUD0170 } from '@fudic/diagnostics';
import type { OxcNode } from '../oxc/index.js';
import { LineMap, SourceMapBuilder, type SourceMapV3 } from '../sourcemap/index.js';
import type { ParseResult, ResolveIo } from '../types/index.js';
import { span, withDiagnostics } from '../types/index.js';
import { i18nImports } from './ast.js';
import { contextOf } from './extract.js';
import { localizeScript, localizeSource, type LocaleCompile, type LocalizedSource } from './localize.js';
import { collectScriptMessages } from './messages.js';

/**
 * `io` with every `.fud` it reads compiled for `i18n.locale` — the entry, its components, its
 * layout and the snippets they pull in — and `origin` answering the way back to each. Each file
 * is rewritten once per `io`.
 */
export function localizedIo<T extends ResolveIo>(io: T, i18n: LocaleCompile): T {
  const cache = new Map<string, { readonly source: string; readonly localized: LocalizedSource }>();
  const get = (path: string): { readonly source: string; readonly localized: LocalizedSource } => {
    let entry = cache.get(path);
    if (entry === undefined) {
      const source = io.read(path);
      entry = { source, localized: localizeSource(source, path, i18n) };
      cache.set(path, entry);
    }
    return entry;
  };
  const read = (path: string): string => get(path).localized.source;
  const origin = (path: string): { readonly source: string; readonly map: LocalizedSource['map'] } => {
    const entry = get(path);
    return { source: entry.source, map: entry.localized.map };
  };
  // Every other member of the host's io stays what it was: the plugin's carries more than reads.
  return new Proxy(io, {
    get(target, key, receiver) {
      if (key === 'read') return read;
      if (key === 'origin') return origin;
      const value: unknown = Reflect.get(target, key, receiver);
      return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
  });
}

/** Compile a `.ts`/`.js` app module for one locale: `t`, `format` and `locale` replaced. */
export function translateScript(
  source: string,
  file: string,
  i18n: LocaleCompile,
): ParseResult<{ readonly code: string; readonly map: SourceMapV3 }> {
  const parsed = parseSync(file, source, { sourceType: 'module', lang: /\.[cm]?js$/u.test(file) ? 'js' : 'ts' });
  const program = parsed.program.body as unknown as readonly OxcNode[];
  const collected = collectScriptMessages(contextOf(i18n.relative?.(file) ?? file), program, i18nImports(program));
  const localized = localizeScript(source, program, i18n, collected, file);

  const builder = new SourceMapBuilder({
    file,
    source: file,
    sourceContent: source,
    sourceLineMap: new LineMap(source),
    generatedLineMap: new LineMap(localized.source),
  });
  // A mapping where each stretch starts and at every line start: a copied stretch moves by a
  // constant, so the two are enough for a debugger to land on the line it was asked for.
  const at = new Set(localized.map.starts());
  for (let i = 0; i < localized.source.length; i++) if (localized.source[i] === '\n') at.add(i + 1);
  at.add(0);
  for (const offset of [...at].sort((a, b) => a - b)) {
    if (offset < localized.source.length) builder.addMapping(offset, localized.map.entryOffset(offset));
  }

  const syntax = parsed.errors.map((e) => {
    const label = e.labels[0];
    return FUD0170({ span: label === undefined ? span(0, 0) : span(label.start, label.end), detail: e.message });
  });
  return withDiagnostics({ code: localized.source, map: builder.build() }, [...syntax, ...collected.diagnostics]);
}
