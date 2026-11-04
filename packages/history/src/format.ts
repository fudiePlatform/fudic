import type { HistoryEvent, HistoryLine } from './types.js';

/** Wider than the longest event name, so the fields of every line start in one column. */
const KIND_WIDTH = 12;

/** Words of one field are joined by one space; fields, by two, to read as columns. */
const FIELD = '  ';

/** A free text: a JSON string, so quotes and line breaks survive in one line. */
export const quote = (text: string): string => JSON.stringify(text);

/** A person's name as a single word: spaces become `-`. */
export const person = (name: string): string => name.trim().replace(/\s+/gu, '-');

const fieldsOf = (event: HistoryEvent): readonly string[] => {
  switch (event.kind) {
    case 'started':
    case 'reopened':
      return [`by ${person(event.by)}`, quote(event.text)];
    case 'approved':
      return [`by ${person(event.by)}`, `spec ${event.criteria} hash ${event.hash}`];
    case 'tests':
      return [`${event.verdict} ${event.passed}/${event.total}`, `hash ${event.hash}`];
    case 'spec_run':
      return [
        `${event.verdict} ${event.passed}/${event.total}`,
        `hash ${event.hash}`,
        ...(event.failing.length > 0 ? [event.failing.join(' ')] : []),
      ];
    case 'documented':
      return [`${event.documented}/${event.props}`];
    case 'look':
      return [`by ${person(event.by)}`, `hash ${event.hash}`];
    case 'done':
      return [];
    case 'accepted':
      return [`by ${person(event.by)}`, quote(event.text), `tag ${event.tag}`];
    case 'connected':
      return [event.functions.join(' ')];
  }
};

/** One line of a `.fudlog`, without its line ending. */
export function formatLine(line: Omit<HistoryLine, 'span'>): string {
  const { at, commit, event } = line;
  const fields = fieldsOf(event);
  return fields.length === 0
    ? `${at} ${commit} ${event.kind}`
    : `${at} ${commit} ${event.kind.padEnd(KIND_WIDTH)}${fields.join(FIELD)}`;
}
