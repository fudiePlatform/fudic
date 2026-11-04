import { FUD1220, span, type SourceDiagnostic } from '@fudic/diagnostics';
import type { HistoryEvent, HistoryKind, HistoryLine, ParseResult } from './types.js';

const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/u;
const COMMIT = /^(?:[0-9a-f]{7}|-{7})$/u;
const HASH = /^[0-9a-f]{12}$/u;
const NUMBER = /^\d+$/u;
const COUNT = /^(\d+)\/(\d+)$/u;
/** A quoted text with JSON escapes, or a run of anything but spaces. */
const TOKEN = /"(?:[^"\\]|\\.)*"|\S+/gu;

/** Why a line cannot be read. Thrown by the cursor and caught by the line: it never leaves this module. */
class Unreadable extends Error {}

/** The fields of one line, read left to right. */
class Fields {
  private next = 0;

  constructor(private readonly tokens: readonly string[]) {}

  private take(what: string): string {
    const token = this.tokens[this.next];
    if (token === undefined) throw new Unreadable(`${what} is missing`);
    this.next += 1;
    return token;
  }

  /** A bare word: no quotes. */
  word(what: string): string {
    const token = this.take(what);
    if (token.includes('"')) throw new Unreadable(`${what} is not a word: ${token}`);
    return token;
  }

  keyword(expected: string): void {
    const token = this.take(`\`${expected}\``);
    if (token !== expected) throw new Unreadable(`expected \`${expected}\`, found ${token}`);
  }

  text(): string {
    const token = this.take('the text');
    try {
      const value: unknown = JSON.parse(token);
      if (typeof value === 'string') return value;
    } catch {
      // A bad escape: reported below like any other token that is not a text.
    }
    throw new Unreadable(`not a quoted text: ${token}`);
  }

  number(what: string): number {
    const token = this.take(what);
    if (!NUMBER.test(token)) throw new Unreadable(`${what} is not a number: ${token}`);
    return Number(token);
  }

  count(): { passed: number; total: number } {
    const token = this.take('the count');
    const match = COUNT.exec(token);
    if (match === null) throw new Unreadable(`not a count: ${token}`);
    const passed = Number(match[1]);
    const total = Number(match[2]);
    if (passed > total) throw new Unreadable(`more passed than ran: ${token}`);
    return { passed, total };
  }

  hash(): string {
    this.keyword('hash');
    const token = this.take('the hash');
    if (!HASH.test(token)) throw new Unreadable(`not a hash: ${token}`);
    return token;
  }

  by(): string {
    this.keyword('by');
    return this.word('who');
  }

  oneOf<T extends string>(what: string, values: readonly T[]): T {
    const token = this.take(what);
    const found = values.find((value) => value === token);
    if (found === undefined) throw new Unreadable(`${what} is not one of ${values.join(', ')}: ${token}`);
    return found;
  }

  /** Every word left. */
  rest(what: string): string[] {
    const words: string[] = [];
    while (this.next < this.tokens.length) words.push(this.word(what));
    return words;
  }

  end(): void {
    const extra = this.tokens[this.next];
    if (extra !== undefined) throw new Unreadable(`unexpected ${extra}`);
  }
}

type Reader = (f: Fields) => HistoryEvent;

/** The fields of each event, in the order a line writes them. */
const READERS: Readonly<Record<HistoryKind, Reader>> = {
  started: (f) => ({ kind: 'started', by: f.by(), text: f.text() }),
  approved: (f) => {
    const by = f.by();
    f.keyword('spec');
    return { kind: 'approved', by, criteria: f.number('the criteria'), hash: f.hash() };
  },
  tests: (f) => ({ kind: 'tests', verdict: f.oneOf('the verdict', ['pass', 'red', 'broken']), ...f.count(), hash: f.hash() }),
  spec_run: (f) => ({
    kind: 'spec_run',
    verdict: f.oneOf('the verdict', ['pass', 'fail', 'error']),
    ...f.count(),
    hash: f.hash(),
    failing: f.rest('a criterion'),
  }),
  documented: (f) => {
    const { passed, total } = f.count();
    return { kind: 'documented', documented: passed, props: total };
  },
  look: (f) => ({ kind: 'look', by: f.by(), hash: f.hash() }),
  reopened: (f) => ({ kind: 'reopened', by: f.by(), text: f.text() }),
  done: () => ({ kind: 'done' }),
  accepted: (f) => {
    const by = f.by();
    const text = f.text();
    f.keyword('tag');
    return { kind: 'accepted', by, text, tag: f.word('the tag') };
  },
  connected: (f) => {
    const functions = f.rest('a function');
    if (functions.length === 0) throw new Unreadable('no function is named');
    return { kind: 'connected', functions };
  },
};

const isKind = (word: string): word is HistoryKind => Object.hasOwn(READERS, word);

function readLine(text: string, start: number): HistoryLine {
  const fields = new Fields(Array.from(text.matchAll(TOKEN), (match) => match[0]));
  const at = fields.word('the instant');
  if (!INSTANT.test(at)) throw new Unreadable(`not an instant: ${at}`);
  const commit = fields.word('the commit');
  if (!COMMIT.test(commit)) throw new Unreadable(`not a commit: ${commit}`);
  const kind = fields.word('the event');
  if (!isKind(kind)) throw new Unreadable(`unknown event: ${kind}`);
  const event = READERS[kind](fields);
  fields.end();
  return { at, commit, event, span: span(start, start + text.length) };
}

/** Reads a `.fudlog`. Never throws: a line it cannot read is a FUD1220 and is skipped. Lines come sorted by instant (stable). */
export function parseHistory(text: string, file?: string): ParseResult<readonly HistoryLine[]> {
  const lines: HistoryLine[] = [];
  const diagnostics: SourceDiagnostic[] = [];
  let start = 0;
  for (const raw of text.split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (line.trim() !== '') {
      try {
        lines.push(readLine(line, start));
      } catch (error) {
        const where = span(start, start + line.length);
        const reason = (error as Unreadable).message;
        diagnostics.push(FUD1220(file === undefined ? { span: where, reason } : { span: where, file, reason }));
      }
    }
    start += raw.length + 1;
  }
  // Array sort is stable: two lines of one instant keep their order in the file.
  lines.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  return { value: lines, diagnostics };
}
