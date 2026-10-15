/**
 * The catalog: a folder per language, `src/locales/<locale>/`, with one file per source file
 * (SDD-58 §4.9, §4.10). A team iterating on an app meets in a catalog only when it touches the
 * same component; one file per language grows without end and conflicts on every merge.
 *
 * Only `fudic translate` writes one — through `mergeCatalog` and `printCatalog` here. The
 * pipeline only reads it, through `parseCatalog`, and falls back to the original text for
 * whatever it cannot use.
 */

import { FUD1023, type FileDiagnostic } from '@fudic/diagnostics';
import type { ParseResult } from './result.js';
import { sha1 } from './sha1.js';

export interface CatalogEntry {
  /** The message in the first locale, ICU-escaped. */
  readonly source: string;
  /** Absent ⇒ missing. */
  readonly translation?: string;
  /** The previous `source`, when the text changed under a translation. */
  readonly review?: string;
  /** Hole name → expression source. */
  readonly holes?: Readonly<Record<string, string>>;
  /** The source file, relative to the app: `src/components/app-card.fud`. Never the line. */
  readonly where: string;
  /** Ordinal of the message inside its context. */
  readonly at: number;
}

/** Context → key → entry. */
export type Catalog = Readonly<Record<string, Readonly<Record<string, CatalogEntry>>>>;

/** One message as extraction found it: what `mergeCatalog` needs of it. */
export interface ExtractedMessage {
  readonly context: string;
  readonly key: string;
  readonly source: string;
  /** Hole name → expression source; empty when the message has none. */
  readonly holes: Readonly<Record<string, string>>;
  readonly where: string;
  readonly at: number;
}

/**
 * The key of a message: the first 8 hex of SHA-1 over `context + "\0" + source`. The same
 * text twice in one context is one message with one translation.
 */
export function messageKey(context: string, source: string): string {
  return sha1(`${context}\0${source}`).slice(0, 8);
}

/**
 * Read a catalog. A file that is not JSON, or not the shape of a `Catalog`, is `FUD1023` and
 * the EMPTY catalog: the whole file is unusable, and every message of that locale falls back to
 * its original text.
 */
export function parseCatalog(text: string, file: string): ParseResult<Catalog, FileDiagnostic> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return unreadable(file, (error as Error).message);
  }
  if (!isObject(parsed)) return unreadable(file, 'it is not an object of contexts');
  for (const [context, entries] of Object.entries(parsed)) {
    if (!isObject(entries)) return unreadable(file, `"${context}" is not an object of messages`);
    for (const [key, entry] of Object.entries(entries)) {
      const wrong = entryProblem(entry);
      if (wrong !== undefined) return unreadable(file, `"${context}"."${key}" ${wrong}`);
    }
  }
  return { value: parsed as Catalog, diagnostics: [] };
}

/** What is wrong with one entry, or `undefined` when it is a `CatalogEntry`. */
function entryProblem(entry: unknown): string | undefined {
  if (!isObject(entry)) return 'is not an object';
  if (typeof entry['source'] !== 'string') return 'has no string "source"';
  if (typeof entry['where'] !== 'string') return 'has no string "where"';
  if (!Number.isInteger(entry['at'])) return 'has no integer "at"';
  for (const field of ['translation', 'review'] as const) {
    if (entry[field] !== undefined && typeof entry[field] !== 'string') return `has a "${field}" that is not a string`;
  }
  const holes = entry['holes'];
  if (holes !== undefined && (!isObject(holes) || Object.values(holes).some((h) => typeof h !== 'string'))) {
    return 'has "holes" that are not an object of strings';
  }
  return undefined;
}

function unreadable(file: string, reason: string): ParseResult<Catalog, FileDiagnostic> {
  return { value: {}, diagnostics: [FUD1023({ file, reason })] };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The catalog after an extraction (§4.10):
 *
 * - **new** message: in the first locale's catalog (`isSource`) with `translation` = `source`,
 *   which is where the author turns `"{count} mensajes"` into a plural; elsewhere without one;
 * - message that **stays**: keeps `translation` and `review`; `where` and `holes` are refreshed;
 * - **changed** text: a message that disappeared and one that appeared in the same context
 *   with the same `at` — the new one inherits the old `translation`, with `review` = the old
 *   `source`. Not in the first locale's catalog: there the translation IS the text, and an
 *   inherited one would paint the old text under the new;
 * - message that **no longer exists**: dropped. Its translation stays in git's history.
 *
 * The same text twice in one context is one message: the first occurrence gives `where`/`at`.
 */
export function mergeCatalog(previous: Catalog, extracted: readonly ExtractedMessage[], isSource: boolean): Catalog {
  const byContext = new Map<string, ExtractedMessage[]>();
  for (const message of extracted) {
    const list = byContext.get(message.context) ?? [];
    if (!list.some((m) => m.key === message.key)) list.push(message);
    byContext.set(message.context, list);
  }

  const next: Record<string, Record<string, CatalogEntry>> = {};
  for (const [context, messages] of byContext) {
    const before = previous[context] ?? {};
    const keys = new Set(messages.map((m) => m.key));
    // What disappeared, by `at`: the candidates a changed text inherits from.
    const gone = new Map<number, CatalogEntry>();
    for (const [key, entry] of Object.entries(before)) if (!keys.has(key)) gone.set(entry.at, entry);

    const entries: Record<string, CatalogEntry> = {};
    for (const m of messages) {
      const kept = Object.hasOwn(before, m.key) ? before[m.key] : undefined;
      const renamed = kept === undefined && !isSource ? gone.get(m.at) : undefined;
      if (renamed !== undefined) gone.delete(m.at);
      entries[m.key] = entry(m, kept, renamed, isSource);
    }
    next[context] = entries;
  }
  return next;
}

function entry(
  m: ExtractedMessage,
  kept: CatalogEntry | undefined,
  renamed: CatalogEntry | undefined,
  isSource: boolean,
): CatalogEntry {
  const translation = kept !== undefined ? kept.translation : renamed !== undefined ? renamed.translation : isSource ? m.source : undefined;
  const review = kept !== undefined ? kept.review : renamed?.translation !== undefined ? renamed.source : undefined;
  return {
    source: m.source,
    ...(translation === undefined ? {} : { translation }),
    ...(review === undefined ? {} : { review }),
    ...(Object.keys(m.holes).length === 0 ? {} : { holes: m.holes }),
    where: m.where,
    at: m.at,
  };
}

/**
 * Where the messages of a source file live inside a locale's folder (§4.10), from their
 * `where`: `src/components/app-card.fud` → `components/app-card.json`. `src/` and the
 * extension go; a library's file keeps its package path without `node_modules/`.
 */
export function catalogPathOf(where: string): string {
  const segments = where
    .replace(/:\d+$/u, '')
    .split('/')
    .filter((s) => s !== '' && s !== '.' && s !== '..' && s !== 'node_modules');
  if (segments[0] === 'src') segments.shift();
  return `${segments.join('/').replace(/\.[^./]*$/u, '')}.json`;
}

/** A locale's catalog cut into its files: catalog path → the messages that live there. */
export function splitCatalog(catalog: Catalog): ReadonlyMap<string, Catalog> {
  const files = new Map<string, Record<string, Record<string, CatalogEntry>>>();
  for (const [context, entries] of Object.entries(catalog)) {
    for (const [key, e] of Object.entries(entries)) {
      const path = catalogPathOf(e.where);
      const file = files.get(path) ?? {};
      files.set(path, file);
      file[context] = { ...file[context], [key]: e };
    }
  }
  return files;
}

/** The files of a locale's folder, read, as the one catalog they make up. */
export function joinCatalogs(parts: readonly Catalog[]): Catalog {
  const whole: Record<string, Record<string, CatalogEntry>> = {};
  for (const part of parts) {
    for (const [context, entries] of Object.entries(part)) whole[context] = { ...whole[context], ...entries };
  }
  return whole;
}

/**
 * The text of a catalog, stable byte for byte: contexts in alphabetical order, entries by `at`
 * (then key), fields in the order of `CatalogEntry`, two spaces, a final newline.
 */
export function printCatalog(catalog: Catalog): string {
  const sorted: Record<string, Record<string, CatalogEntry>> = {};
  for (const context of Object.keys(catalog).sort(compare)) {
    const entries = catalog[context]!;
    const keys = Object.keys(entries).sort((a, b) => entries[a]!.at - entries[b]!.at || compare(a, b));
    sorted[context] = {};
    for (const key of keys) sorted[context][key] = ordered(entries[key]!);
  }
  return `${JSON.stringify(sorted, null, 2)}\n`;
}

function ordered(e: CatalogEntry): CatalogEntry {
  return {
    source: e.source,
    ...(e.translation === undefined ? {} : { translation: e.translation }),
    ...(e.review === undefined ? {} : { review: e.review }),
    ...(e.holes === undefined ? {} : { holes: e.holes }),
    where: e.where,
    at: e.at,
  };
}

/** Code-unit order: the same on every machine, unlike `localeCompare`. The keys of one object are distinct, so never equal. */
function compare(a: string, b: string): number {
  return a < b ? -1 : 1;
}
