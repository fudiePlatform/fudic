/**
 * The three `.headers` files of a project. A missing one reads as its template; one that is there
 * is read as it is, errors included: a broken file never falls back to the template, because the
 * author believes they changed something. Never throws.
 */

import { FUD1540, FUD1554, type FileDiagnostic, type SourceComment } from '@fudic/diagnostics';
import type { ConfigIo } from '../read.js';
import { HEADERS_FILES, parseHeaders, type AssetRule } from './parse.js';
import type { HeaderEntry, HeadersKind } from './segments.js';
import { HEADERS_TEMPLATES } from './templates.js';

export interface HeadersConfig {
  readonly page: readonly HeaderEntry[];
  readonly sw: readonly HeaderEntry[];
  readonly assets: readonly AssetRule[];
}

/** The text of a file that is there and its comments: what the `fud-disable` directives need. */
export interface HeadersSource {
  readonly text: string;
  readonly comments: readonly SourceComment[];
}

export interface HeadersRead {
  readonly config: HeadersConfig;
  readonly diagnostics: readonly FileDiagnostic[];
  /** The files that are there, by kind. */
  readonly sources: Partial<Record<HeadersKind, HeadersSource>>;
}

export interface ReadHeadersOptions {
  readonly kind: 'app' | 'lib';
  /** Whether the app has a Service Worker (`sw.json`). */
  readonly sw: boolean;
}

/** The three files of `root`; a missing one is its template. */
export function readHeaders(root: string, io: ConfigIo, options: ReadHeadersOptions): HeadersRead {
  const diagnostics: FileDiagnostic[] = [];
  const sources: Partial<Record<HeadersKind, HeadersSource>> = {};
  const read = <E>(kind: HeadersKind, parse: (text: string) => { entries: readonly E[]; diagnostics: readonly FileDiagnostic[]; comments: readonly SourceComment[] }): readonly E[] => {
    const file = HEADERS_FILES[kind];
    const path = `${root}/${file}`;
    const there = io.exists(path);
    const applies = options.kind === 'app' && (kind !== 'sw' || options.sw);
    if (!applies) {
      if (there) diagnostics.push(FUD1554({ file, reason: options.kind === 'lib' ? 'lib' : 'no-sw' }));
      return [];
    }
    let text = HEADERS_TEMPLATES[kind];
    if (there) {
      try {
        text = io.read(path);
      } catch (error) {
        diagnostics.push(FUD1540({ file, problem: 'unreadable', name: error instanceof Error ? error.message : String(error) }));
        return [];
      }
    }
    const parsed = parse(text);
    diagnostics.push(...parsed.diagnostics);
    if (there) sources[kind] = { text, comments: parsed.comments };
    return parsed.entries;
  };
  const config: HeadersConfig = {
    page: read('page', (text) => parseHeaders('page', text)),
    sw: read('sw', (text) => parseHeaders('sw', text)),
    assets: read('assets', (text) => parseHeaders('assets', text)),
  };
  return { config, diagnostics, sources };
}
