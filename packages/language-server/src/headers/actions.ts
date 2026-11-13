/**
 * The bulbs of a `.headers` file (SDD-84 §3.8), besides the comment ones every file has:
 *
 * - «Add `<source>`» on `FUD1545` and `FUD1548`: what the piece that emitted it needs, at the end
 *   of the directive the browser reads.
 * - «Remove `<source>`» on `FUD1556`: what the policy kept for fudic and nothing needs.
 * - «Remove the line» on `FUD1542` and `FUD1546`: a header goes with its continuations, a block of
 *   `assets.headers` with its headers.
 * - «Change to `<value>`» on `FUD1543`, when the header takes a closed set of values and one of
 *   them looks like what is written.
 */

import { KNOWN_HEADERS, type AssetRule, type CspPolicy, type HeaderEntry, type NeedFinding } from '@fudic/config';
import type { Span } from '@fudic/diagnostics';
import type { CodeAction } from '@volar/language-service';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { ShownDiagnostic } from '../services/suppressions.js';

/** What the bulbs of one `.headers` read. */
export interface HeadersFile {
  readonly uri: string;
  readonly text: string;
  /** What the file holds, as the reader parsed it. */
  readonly entries: readonly (HeaderEntry | AssetRule)[];
  /** Its `Content-Security-Policy`, if it has one. */
  readonly policy: CspPolicy | undefined;
  /** What the build's needs say of the policy (`FUD1545`, `FUD1548`, `FUD1556`). */
  readonly findings: readonly NeedFinding[];
}

/** The bulbs of the diagnostics of `file` shown between `start` and `end`. */
export function headersActions(file: HeadersFile, shown: readonly ShownDiagnostic[], start: number, end: number): CodeAction[] {
  const doc = TextDocument.create(file.uri, 'fudheaders', 0, file.text);
  const action = (title: string, span: Span, newText: string): CodeAction => ({
    title,
    kind: 'quickfix',
    diagnostics: [],
    edit: { changes: { [file.uri]: [{ range: { start: doc.positionAt(span.start), end: doc.positionAt(span.end) }, newText }] } },
  });
  const out: CodeAction[] = [];
  for (const d of shown.filter((d) => d.span.start <= end && start <= d.span.end)) {
    if (d.code === 'FUD1542' || d.code === 'FUD1546') out.push(action('Remove the line', lineExtent(file, d.span.start), ''));
    if (d.code === 'FUD1543') {
      const change = closestValue(file, d.span);
      if (change !== undefined) out.push(action(`Change to ${change.value}`, change.span, change.value));
    }
    const finding = file.findings.find((f) => f.diagnostic.code === d.code && f.span.start === d.span.start && f.diagnostic.message === d.message);
    if (finding === undefined) continue;
    if (finding.action === 'add') {
      const at = directiveEnd(file.policy!, finding.span);
      out.push(action(`Add ${finding.source}`, { start: at, end: at }, ` ${finding.source}`));
    } else {
      const before = /[ \t]*$/u.exec(file.text.slice(0, finding.span.start))![0].length;
      out.push(action(`Remove ${finding.source}`, { start: finding.span.start - before, end: finding.span.end }, ''));
    }
  }
  return out;
}

/** The end of the directive whose name is at `name`: after its last source, or after its name. */
function directiveEnd(policy: CspPolicy, name: Span): number {
  const directive = policy.directives.find((d) => d.span.start === name.start)!;
  return directive.sources.at(-1)?.span.end ?? directive.span.end;
}

/**
 * What «Remove the line» removes for a diagnostic at `at`: the header that starts on its line with
 * its continuations, the block whose path is on it with its headers, or else that line alone.
 */
function lineExtent(file: HeadersFile, at: number): Span {
  const { text } = file;
  const start = text.lastIndexOf('\n', at - 1) + 1;
  const lineEnd = (offset: number): number => {
    const newline = text.indexOf('\n', offset);
    return newline < 0 ? text.length : newline + 1;
  };
  const here = (span: Span): boolean => span.start >= start && span.start < lineEnd(start);
  const spans = file.entries.flatMap((entry): Span[] => {
    if ('pattern' in entry) {
      const last = entry.headers.at(-1);
      return [{ start: entry.span.start, end: last?.span.end ?? entry.span.end }, ...entry.headers.map((h) => h.span)];
    }
    return [entry.span];
  });
  const owned = spans.find(here);
  return { start, end: lineEnd(owned?.end ?? at) };
}

/** The closed value most like the one written at `span`, if one is like it at all. */
function closestValue(file: HeadersFile, span: Span): { readonly span: Span; readonly value: string } | undefined {
  const entry = file.entries
    .flatMap((e) => ('pattern' in e ? e.headers : [e]))
    .find((e) => e.span.start <= span.start && span.end <= e.span.end);
  const values = entry === undefined ? undefined : KNOWN_HEADERS.get(entry.name.toLowerCase())?.values;
  if (values === undefined) return undefined;
  // The value without its parameters: `same-site; report-to="x"` changes `same-site`.
  const written = file.text.slice(span.start, span.end).split(';')[0]!.trim();
  const ranked = values.map((value) => ({ value, distance: distance(written, value) })).sort((a, b) => a.distance - b.distance);
  const best = ranked[0]!;
  if (best.distance > 0.6 * Math.max(written.length, best.value.length)) return undefined;
  return { span: { start: span.start, end: span.start + written.length }, value: best.value };
}

/** The Levenshtein distance between two words. */
function distance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) {
      next[j] = Math.min(row[j]! + 1, next[j - 1]! + 1, row[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    row = next;
  }
  return row[b.length]!;
}
