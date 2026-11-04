/**
 * SDD-65 criteria 1 and 2: every event of §3.2 goes through `formatLine` and comes back from
 * `parseHistory` the same, and a line that cannot be read is a FUD1220 that does not stop the rest.
 */

import { describe, expect, it } from 'vitest';
import { formatLine, type HistoryEvent, NO_COMMIT, parseHistory, person } from '../src/index.js';

const AT = '2026-10-22T10:02Z';
const COMMIT = 'a1b2c3d';
const HASH = '2b8f3c91aa04';

/** One of each event of the table of §3.2, the free texts with quotes and escaped breaks. */
const EVENTS: readonly HistoryEvent[] = [
  { kind: 'started', by: 'agent', text: "Button for the current page's actions" },
  { kind: 'started', by: 'agent', text: 'Say "press"\nthen\ttab \\ and é' },
  { kind: 'approved', by: 'pedro', criteria: 4, hash: HASH },
  { kind: 'tests', verdict: 'red', passed: 0, total: 6, hash: HASH },
  { kind: 'tests', verdict: 'pass', passed: 6, total: 6, hash: HASH },
  { kind: 'tests', verdict: 'broken', passed: 2, total: 8, hash: HASH },
  { kind: 'spec_run', verdict: 'fail', passed: 0, total: 4, hash: HASH, failing: [] },
  { kind: 'spec_run', verdict: 'fail', passed: 2, total: 4, hash: HASH, failing: ['disabled-no-press', 'focus-ring'] },
  { kind: 'spec_run', verdict: 'error', passed: 3, total: 4, hash: HASH, failing: ['loads'] },
  { kind: 'spec_run', verdict: 'pass', passed: 4, total: 4, hash: HASH, failing: [] },
  { kind: 'documented', documented: 3, props: 5 },
  { kind: 'look', by: 'pedro', hash: HASH },
  { kind: 'reopened', by: 'pedro', text: 'The "danger" variant, please' },
  { kind: 'done' },
  { kind: 'accepted', by: 'client', text: 'Client accepted it', tag: 'accepted/acme-button/2026-10-22' },
  { kind: 'connected', functions: ['save'] },
  { kind: 'connected', functions: ['save', 'remove', 'list'] },
];

describe('round trip (criterion 1)', () => {
  for (const event of EVENTS) {
    it(`${event.kind}: ${JSON.stringify(event)}`, () => {
      const text = formatLine({ at: AT, commit: COMMIT, event });
      expect(text).not.toContain('\n');
      const { value, diagnostics } = parseHistory(`${text}\n`);
      expect(diagnostics).toEqual([]);
      expect(value).toEqual([{ at: AT, commit: COMMIT, event, span: { start: 0, end: text.length } }]);
    });
  }

  it('reads back a whole history, one line per event, with the no-commit mark', () => {
    const text = EVENTS.map((event) => `${formatLine({ at: AT, commit: NO_COMMIT, event })}\n`).join('');
    const { value, diagnostics } = parseHistory(text);
    expect(diagnostics).toEqual([]);
    expect(value.map((line) => line.event)).toEqual(EVENTS);
    expect(value.every((line) => line.commit === '-------')).toBe(true);
  });

  it('writes the lines of §1.1', () => {
    expect(formatLine({ at: AT, commit: COMMIT, event: EVENTS[0]! })).toBe(
      `2026-10-22T10:02Z a1b2c3d started     by agent  "Button for the current page's actions"`,
    );
    expect(formatLine({ at: AT, commit: COMMIT, event: EVENTS[2]! })).toBe(
      '2026-10-22T10:02Z a1b2c3d approved    by pedro  spec 4 hash 2b8f3c91aa04',
    );
    expect(formatLine({ at: AT, commit: COMMIT, event: EVENTS[3]! })).toBe(
      '2026-10-22T10:02Z a1b2c3d tests       red 0/6  hash 2b8f3c91aa04',
    );
    expect(formatLine({ at: AT, commit: COMMIT, event: { kind: 'spec_run', verdict: 'fail', passed: 3, total: 4, hash: HASH, failing: ['disabled-no-press'] } })).toBe(
      '2026-10-22T10:02Z a1b2c3d spec_run    fail 3/4  hash 2b8f3c91aa04  disabled-no-press',
    );
    expect(formatLine({ at: AT, commit: COMMIT, event: { kind: 'done' } })).toBe('2026-10-22T10:02Z a1b2c3d done');
  });

  it('reads the example of §1.1 as written in the spec', () => {
    const text = [
      '2026-10-22T10:02Z a1b2c3d started     by agent  "Button for the current page\'s actions"',
      '2026-10-22T10:20Z d4e5f6a approved    by pedro  spec 4 hash 2b8f3c91aa04',
      '2026-10-22T10:31Z 0a9b8c7 tests       red 0/6  hash 91c2e7d40b18',
      '2026-10-22T10:33Z 0a9b8c7 spec_run    fail 0/4  hash 91c2e7d40b18',
      '2026-10-22T10:48Z 7f6e5d4 spec_run    fail 3/4  hash 4471a0c2be6d  disabled-no-press',
      '2026-10-22T10:52Z 3c2b1a0 spec_run    pass 4/4  hash 5e7a90c3d211',
      '2026-10-22T10:52Z 3c2b1a0 tests       pass 6/6  hash 5e7a90c3d211',
      '2026-10-22T11:06Z 9d8c7b6 done',
      '',
    ].join('\n');
    const { value, diagnostics } = parseHistory(text);
    expect(diagnostics).toEqual([]);
    expect(value.map((line) => line.event.kind)).toEqual([
      'started', 'approved', 'tests', 'spec_run', 'spec_run', 'spec_run', 'tests', 'done',
    ]);
    expect(value[4]!.event).toEqual({ kind: 'spec_run', verdict: 'fail', passed: 3, total: 4, hash: '4471a0c2be6d', failing: ['disabled-no-press'] });
  });

  it('turns the spaces of a person into dashes, when writing every `by`', () => {
    expect(person('  Pedro  Hurtado ')).toBe('Pedro-Hurtado');
    for (const kind of ['started', 'reopened'] as const) {
      const line = formatLine({ at: AT, commit: COMMIT, event: { kind, by: 'Pedro Hurtado', text: 'x' } });
      expect(parseHistory(line).value[0]!.event).toMatchObject({ by: 'Pedro-Hurtado' });
    }
    const others: readonly HistoryEvent[] = [
      { kind: 'approved', by: 'Ana María', criteria: 1, hash: HASH },
      { kind: 'look', by: 'Ana María', hash: HASH },
      { kind: 'accepted', by: 'Ana María', text: 'ok', tag: 't' },
    ];
    for (const event of others) {
      expect(parseHistory(formatLine({ at: AT, commit: COMMIT, event })).value[0]!.event).toMatchObject({ by: 'Ana-María' });
    }
  });
});

describe('reading (§4.1)', () => {
  it('reads any run of spaces or tabs between tokens, CRLF ends and blank lines', () => {
    const text = `\n${AT}\t${COMMIT}   tests\tpass   6/6 hash  ${HASH}\r\n   \r\n${AT} ${COMMIT} done\r\n`;
    const { value, diagnostics } = parseHistory(text);
    expect(diagnostics).toEqual([]);
    expect(value.map((line) => line.event)).toEqual([
      { kind: 'tests', verdict: 'pass', passed: 6, total: 6, hash: HASH },
      { kind: 'done' },
    ]);
    // The span is the line without its CR.
    const second = value[1]!;
    expect(text.slice(second.span.start, second.span.end)).toBe(`${AT} ${COMMIT} done`);
  });

  it('reads an empty history as no lines', () => {
    expect(parseHistory('')).toEqual({ value: [], diagnostics: [] });
  });

  it('sorts by instant, keeping the file order of one instant', () => {
    const text = [
      `2026-10-22T10:05Z ${COMMIT} done`,
      `2026-10-22T10:01Z ${COMMIT} connected first`,
      `2026-10-22T10:05Z ${COMMIT} connected second`,
      `2026-10-22T10:01Z ${COMMIT} connected third`,
      `2026-10-22T10:03Z ${COMMIT} connected fourth`,
    ].join('\n');
    const { value } = parseHistory(text);
    expect(value.map((line) => (line.event.kind === 'connected' ? line.event.functions[0] : line.event.kind))).toEqual([
      'first', 'third', 'fourth', 'done', 'second',
    ]);
    // Each line keeps the span it has in the file, not its place after sorting.
    expect(text.slice(value[0]!.span.start, value[0]!.span.end)).toBe(`2026-10-22T10:01Z ${COMMIT} connected first`);
  });
});

describe('a line that cannot be read (criterion 2)', () => {
  it('is a FUD1220 on its line, and the rest is read', () => {
    const good1 = `${AT} ${COMMIT} done`;
    const bad = '2026-10-22T10:02Z abc garbage';
    const good2 = `2026-10-22T10:03Z ${COMMIT} tests  pass 6/6  hash ${HASH}`;
    const text = `${good1}\n${bad}\n${good2}\n`;
    const { value, diagnostics } = parseHistory(text, 'src/components/acme-button/acme-button.fudlog');
    expect(value.map((line) => line.event.kind)).toEqual(['done', 'tests']);
    expect(diagnostics).toHaveLength(1);
    const [d] = diagnostics;
    expect(d).toMatchObject({ code: 'FUD1220', severity: 'warning', file: 'src/components/acme-button/acme-button.fudlog' });
    expect(text.slice(d!.span.start, d!.span.end)).toBe(bad);
  });

  it('carries no file when it is not given one', () => {
    const { diagnostics } = parseHistory('nope');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).not.toHaveProperty('file');
    expect(diagnostics[0]!.span).toEqual({ start: 0, end: 4 });
  });

  /** Each line, and the words of the reason it gives. */
  const BROKEN: readonly (readonly [string, string])[] = [
    ['2026-10-22 a1b2c3d done', 'not an instant: 2026-10-22'],
    ['"2026-10-22T10:02Z" a1b2c3d done', 'the instant is not a word'],
    ['2026-10-22T10:02Z', 'the commit is missing'],
    ['2026-10-22T10:02Z abc done', 'not a commit: abc'],
    ['2026-10-22T10:02Z A1B2C3D done', 'not a commit: A1B2C3D'],
    ['2026-10-22T10:02Z a1b2c3d', 'the event is missing'],
    ['2026-10-22T10:02Z a1b2c3d garbage', 'unknown event: garbage'],
    ['2026-10-22T10:02Z a1b2c3d toString', 'unknown event: toString'],
    ['2026-10-22T10:02Z a1b2c3d done extra', 'unexpected extra'],
    ['2026-10-22T10:02Z a1b2c3d started', '`by` is missing'],
    ['2026-10-22T10:02Z a1b2c3d started for agent "x"', 'expected `by`, found for'],
    ['2026-10-22T10:02Z a1b2c3d started by', 'who is missing'],
    ['2026-10-22T10:02Z a1b2c3d started by "agent" "x"', 'who is not a word'],
    ['2026-10-22T10:02Z a1b2c3d started by agent', 'the text is missing'],
    ['2026-10-22T10:02Z a1b2c3d started by agent hello', 'not a quoted text: hello'],
    ['2026-10-22T10:02Z a1b2c3d started by agent 123', 'not a quoted text: 123'],
    ['2026-10-22T10:02Z a1b2c3d started by agent "bad \\q escape"', 'not a quoted text: "bad \\q escape"'],
    ['2026-10-22T10:02Z a1b2c3d started by agent "x" "y"', 'unexpected "y"'],
    ['2026-10-22T10:02Z a1b2c3d approved by pedro spec four hash 2b8f3c91aa04', 'the criteria is not a number: four'],
    ['2026-10-22T10:02Z a1b2c3d approved by pedro criteria 4 hash 2b8f3c91aa04', 'expected `spec`, found criteria'],
    ['2026-10-22T10:02Z a1b2c3d approved by pedro spec 4', '`hash` is missing'],
    ['2026-10-22T10:02Z a1b2c3d approved by pedro spec 4 hash', 'the hash is missing'],
    ['2026-10-22T10:02Z a1b2c3d approved by pedro spec 4 hash 2B8F3C91AA04', 'not a hash: 2B8F3C91AA04'],
    ['2026-10-22T10:02Z a1b2c3d approved by pedro spec 4 hash 2b8f3c', 'not a hash: 2b8f3c'],
    ['2026-10-22T10:02Z a1b2c3d tests green 6/6 hash 2b8f3c91aa04', 'the verdict is not one of pass, red, broken: green'],
    ['2026-10-22T10:02Z a1b2c3d tests fail 0/6 hash 2b8f3c91aa04', 'the verdict is not one of pass, red, broken: fail'],
    ['2026-10-22T10:02Z a1b2c3d spec_run red 0/6 hash 2b8f3c91aa04', 'the verdict is not one of pass, fail, error: red'],
    ['2026-10-22T10:02Z a1b2c3d tests pass six hash 2b8f3c91aa04', 'not a count: six'],
    ['2026-10-22T10:02Z a1b2c3d tests pass 7/6 hash 2b8f3c91aa04', 'more passed than ran: 7/6'],
    ['2026-10-22T10:02Z a1b2c3d tests pass', 'the count is missing'],
    ['2026-10-22T10:02Z a1b2c3d spec_run fail 3/4 hash 2b8f3c91aa04 "quoted-id"', 'a criterion is not a word'],
    ['2026-10-22T10:02Z a1b2c3d documented 6/5', 'more passed than ran: 6/5'],
    ['2026-10-22T10:02Z a1b2c3d look by pedro', '`hash` is missing'],
    ['2026-10-22T10:02Z a1b2c3d reopened by pedro', 'the text is missing'],
    ['2026-10-22T10:02Z a1b2c3d accepted by client "ok"', '`tag` is missing'],
    ['2026-10-22T10:02Z a1b2c3d accepted by client "ok" label x', 'expected `tag`, found label'],
    ['2026-10-22T10:02Z a1b2c3d accepted by client "ok" tag', 'the tag is missing'],
    ['2026-10-22T10:02Z a1b2c3d accepted by client "ok" tag "x"', 'the tag is not a word'],
    ['2026-10-22T10:02Z a1b2c3d connected', 'no function is named'],
    ['2026-10-22T10:02Z a1b2c3d connected "save"', 'a function is not a word'],
  ];

  for (const [line, reason] of BROKEN) {
    it(`${line} → ${reason}`, () => {
      const text = `${AT} ${COMMIT} done\n${line}\n`;
      const { value, diagnostics } = parseHistory(text);
      expect(value).toHaveLength(1);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]!.code).toBe('FUD1220');
      expect(diagnostics[0]!.message).toContain(reason);
      expect(text.slice(diagnostics[0]!.span.start, diagnostics[0]!.span.end)).toBe(line);
    });
  }

  it('never throws, whatever the text', () => {
    const noise = ['\u0000', '"', '"\\', '\\', '\r\r\n', '0'.repeat(500), `${AT} ${COMMIT} started by a "unterminated`];
    for (const text of noise) expect(() => parseHistory(text)).not.toThrow();
  });
});
