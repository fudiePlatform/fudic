/**
 * The `load` line of a route's `.fudapi` (SDD-60 §3.4, SDD-70 §3.9), for the editor: what fits
 * at the cursor and what the word under it means. It reads the line as typed, like the rest of
 * completion: half a line is what both are asked about. The words and the values are the ones
 * the parser reads, from `@fudic/api`.
 */

import { LOAD_MODES, LOAD_OPTIONS, LOAD_POLICIES, PAGE_CACHES, bufferBytes, durationMs } from '@fudic/api';
import { STREAM_BUFFER } from '@fudic/conventions';
import { CompletionItemKind, type CompletionItem, type Hover, type MarkupContent } from 'vscode-languageserver-protocol';
import { rangeOf, touches, type ApiDocument } from './document.js';

/** What each word of the line means. */
const WORDS: ReadonlyMap<string, string> = new Map([
  ['load', 'The data of the route: its fields are `data`, read before the page renders.'],
  ['ssg', 'Rendered once, at build time.'],
  ['ssr', 'Rendered on the server, on every request.'],
  ['sw', 'Rendered by the Service Worker, with the data it caches.'],
  ['ttl', 'How long the data stays fresh in the cache: `ttl 5m`.'],
  ['cache-first', 'The cached data while it is fresh; the network only when it is missing or stale.'],
  ['network-first', 'The network first; the cached data when the network fails.'],
  ['stale-while-revalidate', 'The cached data at once, and a request behind it that refreshes the cache.'],
  ['network-only', 'Always the network: the data is never cached.'],
  ['page', 'Whether the Service Worker keeps the rendered HTML of an `sw` route: `page never` or `page persist`.'],
  ['never', 'The rendered HTML is not kept: each visit renders it again from the data. The default.'],
  ['persist', 'The Service Worker keeps the rendered HTML of each URL, as long as the data (`ttl`).'],
  [
    'buffer',
    `The bytes the page stream holds before it sends: \`buffer 0\` sends each piece as soon as it is produced. Without it, ${STREAM_BUFFER}.`,
  ],
]);

/** A value worth offering, and why. */
interface Value {
  readonly label: string;
  readonly doc: string;
}

const UNITS = [
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
  ['second', 1000],
] as const;

/** `300000` as `5 minutes`: the largest unit that divides it. A duration is whole seconds. */
function spelled(ms: number): string {
  const [unit, size] = UNITS.find(([, s]) => ms % s === 0)!;
  const n = ms / size;
  return `${n} ${unit}${n === 1 ? '' : 's'}`;
}

const DURATIONS: readonly Value[] = ['30s', '5m', '1h', '1d'].map((label) => ({ label, doc: spelled(durationMs(label)!) }));

const BUFFERS: readonly Value[] = [
  { label: '0', doc: 'Each piece is sent as soon as it is produced.' },
  { label: `${STREAM_BUFFER / 1024}k`, doc: `${STREAM_BUFFER} bytes: the default, the same as no \`buffer\`.` },
  { label: '16k', doc: '16384 bytes: fewer, larger writes.' },
];

/**
 * The values a word takes right after it. `page persist` may take a duration too, never offered:
 * it is the `ttl` of the data, which wins when they differ.
 */
const TAKES: ReadonlyMap<string, readonly Value[]> = new Map([
  ['ttl', DURATIONS],
  ['buffer', BUFFERS],
  ['page', PAGE_CACHES.map((label) => ({ label, doc: WORDS.get(label)! }))],
]);

const markdown = (value: string): MarkupContent => ({ kind: 'markdown', value });

/**
 * What fits at the cursor of a `load` line. `words` are the words before it, the last the one
 * being typed; `others`, the words after it. After a word that takes a value, its values;
 * otherwise the options the line does not have yet: one mode, one policy, each of the rest once.
 */
export function loadCompletions(words: readonly string[], others: readonly string[]): CompletionItem[] {
  const values = TAKES.get(words[words.length - 2]!);
  if (values !== undefined) {
    return values.map((v, i) => ({ label: v.label, kind: CompletionItemKind.Value, sortText: String(i), documentation: markdown(v.doc) }));
  }
  const used = new Set([...words.slice(1, -1), ...others]);
  const taken = (group: readonly string[], w: string): boolean => group.includes(w) && group.some((g) => used.has(g));
  return LOAD_OPTIONS.filter((w) => !used.has(w) && !taken(LOAD_MODES, w) && !taken(LOAD_POLICIES, w)).map((w) => ({
    label: w,
    kind: CompletionItemKind.Keyword,
    documentation: markdown(WORDS.get(w)!),
  }));
}

/** What the word under the cursor of a `load` line means, or what its value comes to. */
export function loadHover(doc: ApiDocument, offset: number): Hover | undefined {
  const text = doc.text;
  const start = Math.max(text.lastIndexOf('\n', offset - 1), text.lastIndexOf('\r', offset - 1)) + 1;
  const line = lineOf(text, start);
  if (!/^load(?:\s|$)/u.test(line)) return undefined;

  const words = [...line.matchAll(/\S+/gu)].map((m) => ({ text: m[0], span: { start: start + m.index, end: start + m.index + m[0].length } }));
  const at = words.findIndex((w) => touches(w.span, offset));
  if (at === -1) return undefined;
  const word = words[at]!;
  // The first word is always `load`, so a value always has a word before it.
  const said = WORDS.get(word.text) ?? valueOf(words[at - 1]!.text, word.text);
  return said === undefined ? undefined : { contents: markdown(said), range: rangeOf(doc.path, text, word.span) };
}

/** The line starting at `start`, without its comment. */
export function lineOf(text: string, start: number): string {
  return /^[^\r\n]*?(?=\s#|[\r\n]|$)/u.exec(text.slice(start))![0];
}

/** What a value comes to, by the word it follows. */
function valueOf(after: string, text: string): string | undefined {
  if (after === 'buffer') {
    const bytes = bufferBytes(text);
    if (bytes === undefined) return undefined;
    return bytes === 0 ? BUFFERS[0]!.doc : `${bytes} bytes held before the stream sends.`;
  }
  const ms = after === 'ttl' || after === 'persist' ? durationMs(text) : undefined;
  if (ms === undefined) return undefined;
  return after === 'ttl' ? `The data stays fresh ${spelled(ms)}.` : `The HTML is kept ${spelled(ms)}; the \`ttl\` wins when they differ.`;
}
