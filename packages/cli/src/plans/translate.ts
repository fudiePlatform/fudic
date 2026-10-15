/**
 * `fudic translate` (SDD-58 §3.5, §4.10): the one command that writes the catalogs.
 *
 * It reads every `.fud` and every `.ts`/`.js` of the app's `src`, and the `.fud` of the fudic
 * libraries it depends on — the same files the plugin compiles. It extracts their messages,
 * merges them into `src/locales/<locale>.json` and returns, as `FileChange`s, the catalogs whose
 * text changes. Two runs over the same code give the same bytes, and the second has no change.
 *
 * What it reports is about the messages, on the message — in the `.fud` or the `.ts`, never in
 * the JSON — except `FUD1023`, which is about a catalog that cannot be read. A catalog that
 * cannot be read is never rewritten: merging it from nothing would throw its translations away.
 *
 * The pipeline (dev, build, preview) never runs this, and says nothing of what it finds.
 */

import { extractMessages, extractScriptMessages, type Message } from '@fudic/compiler';
import { LOCALES_DIR, SRC_DIR } from '@fudic/conventions';
import { FUD1022, FUD1024, FUD1025, FUD1026, LineMap, type FileDiagnostic } from '@fudic/diagnostics';
import {
  compileMessage,
  mergeCatalog,
  parseCatalog,
  printCatalog,
  shapeOf,
  type Catalog,
  type ExtractedMessage,
  type MessageShape,
} from '@fudic/i18n';
import { findLibraries } from '@fudic/resolve';
import { joinPosix, relativeTo } from '../paths.js';
import { libraryFs } from '../project.js';
import { nodeReadIo, walkFiles, type ReadIo } from '../io.js';
import { resolveTarget, type Target } from '../workspace/target.js';
import type { FileChange, LocaleSummary, PlanDiagnostic, TranslateOptions, TranslatePlan } from '../types.js';

/** The one code of the extraction this command says, read off the catalogue. */
const CONFLICT = FUD1025({ span: { start: 0, end: 0 } }).code;

/** The scripts of the app whose `t()` are messages (§4.3). */
const SCRIPT_EXTENSIONS = ['.ts', '.js'] as const;

/** One message found in a source file, with what the merge and the reports need of it. */
interface Found {
  /** The file, relative to `cwd`: where a diagnostic about the message is said. */
  readonly file: string;
  readonly message: Message;
  readonly extracted: ExtractedMessage;
}

export async function planTranslate(opts: TranslateOptions, io: ReadIo = nodeReadIo()): Promise<TranslatePlan> {
  const resolved = resolveTarget(opts, io);
  const target = resolved.target;
  if (target === undefined) return failed(resolved.errors);
  const locales = target.config.locales;
  if (locales === undefined) return failed([FUD1026()]);

  const diagnostics: PlanDiagnostic[] = [];
  const found = extract(opts.cwd, target, io, diagnostics);
  const changes: FileChange[] = [];
  const errors: FileDiagnostic[] = [];
  const summary: LocaleSummary[] = [];

  locales.forEach((locale, index) => {
    const catalog = joinPosix(LOCALES_DIR, `${locale}.json`);
    const path = joinPosix(target.path, catalog);
    const file = joinPosix(target.dir, catalog);
    const before = io.exists(path) ? io.read(path) : undefined;
    const previous = before === undefined ? { value: {}, diagnostics: [] } : parseCatalog(before, file);
    if (previous.diagnostics.length > 0) {
      errors.push(...previous.diagnostics);
      return;
    }
    // The first locale is the one the code is written in: its new messages enter translated.
    const merged = mergeCatalog(previous.value, found.map((f) => f.extracted), index === 0);
    const text = printCatalog(merged);
    if (before === undefined) changes.push({ kind: 'create', path: file, contents: text });
    else if (text !== before) changes.push({ kind: 'modify', path: file, contents: text, before });
    summary.push(summarize(locale, previous.value, merged));
    diagnostics.push(...report(locale, merged, found));
  });

  return { changes, commands: [], diagnostics, errors, summary };
}

function failed(errors: TranslatePlan['errors']): TranslatePlan {
  return { changes: [], commands: [], diagnostics: [], errors, summary: [] };
}

/**
 * Every message of the app and of its libraries, in a stable order: the app's `src` first,
 * sorted, then each library's files. `FUD1025` is the only diagnostic of the extraction that is
 * this command's to say; the rest are the compiler's, and the editor and the build say them.
 */
function extract(cwd: string, target: Target, io: ReadIo, diagnostics: PlanDiagnostic[]): readonly Found[] {
  const src = joinPosix(target.path, SRC_DIR);
  const files = [
    ...walkFiles(src, io, '.fud').map((f) => joinPosix(src, f)),
    ...SCRIPT_EXTENSIONS.flatMap((ext) => walkFiles(src, io, ext))
      .filter((f) => !f.endsWith('.d.ts'))
      .sort()
      .map((f) => joinPosix(src, f)),
    ...findLibraries(target.path, libraryFs(io)).flatMap((library) => library.files),
  ];

  const found: Found[] = [];
  for (const absolute of files) {
    const source = io.read(absolute);
    // Named as the plugin names it, relative to the app's root: the context of a layout or a
    // snippet is its path, and both sides must spell it the same.
    const name = relativeTo(target.path, absolute);
    const file = relativeTo(cwd, absolute);
    const result = absolute.endsWith('.fud') ? extractMessages(source, name) : extractScriptMessages(source, name);
    for (const diagnostic of result.diagnostics) {
      if (diagnostic.code === CONFLICT) diagnostics.push({ file, diagnostic });
    }
    const lines = new LineMap(source);
    for (const message of result.value) {
      found.push({
        file,
        message,
        extracted: {
          context: message.context,
          key: message.key,
          source: message.source,
          holes: Object.fromEntries(message.holes.map((h) => [h.name, source.slice(h.expr.start, h.expr.end)])),
          where: `${name}:${lines.positionAt(message.span.start).line + 1}`,
          at: message.at,
        },
      });
    }
  }
  return found;
}

/** What the binary prints for one locale. */
function summarize(locale: string, previous: Catalog, merged: Catalog): LocaleSummary {
  let total = 0;
  let added = 0;
  let review = 0;
  let missing = 0;
  for (const [context, entries] of Object.entries(merged)) {
    for (const [key, entry] of Object.entries(entries)) {
      total += 1;
      if (previous[context]?.[key] === undefined) added += 1;
      if (entry.review !== undefined) review += 1;
      if (isMissing(entry.translation)) missing += 1;
    }
  }
  return { locale, total, added, review, missing };
}

/**
 * `FUD1022` for each message with no translation in `locale`, and `FUD1024` for each whose
 * translation is not one: invalid ICU, or holes and tags other than the original's. Once per
 * message, on its first occurrence — the one the catalog's `where` names.
 */
function report(locale: string, catalog: Catalog, found: readonly Found[]): PlanDiagnostic[] {
  const out: PlanDiagnostic[] = [];
  const said = new Set<string>();
  for (const { file, message } of found) {
    const id = `${message.context}\0${message.key}`;
    if (said.has(id)) continue;
    said.add(id);
    // Every extracted message is in the merged catalog: the merge is what put it there.
    const translation = catalog[message.context]![message.key]!.translation;
    if (isMissing(translation)) {
      out.push({ file, diagnostic: FUD1022({ span: message.span, locale }) });
      continue;
    }
    const reason = problemOf(message.source, translation, locale);
    if (reason !== undefined) out.push({ file, diagnostic: FUD1024({ span: message.span, locale, reason }) });
  }
  return out;
}

/** An empty translation is one nobody wrote yet, here as in the pipeline (§4.10). */
function isMissing(translation: string | undefined): translation is undefined {
  return translation === undefined || translation === '';
}

/** Why `translation` cannot stand for `source` in `locale`, or `undefined` when it can. */
function problemOf(source: string, translation: string, locale: string): string | undefined {
  const compiled = compileMessage(translation, locale);
  const broken = compiled.diagnostics[0];
  if (broken !== undefined) return broken.message;
  const want = shapeOf(compileMessage(source, locale).value);
  const got = shapeOf(compiled.value);
  if (JSON.stringify(got) === JSON.stringify(want)) return undefined;
  return `it has ${describe(got)} where the original has ${describe(want)}`;
}

function describe(shape: MessageShape): string {
  const parts = [...shape.holes.map((h) => `{${h}}`), ...shape.tags.map((t) => `<${t}>`)];
  return parts.length === 0 ? 'no holes or tags' : parts.join(', ');
}
