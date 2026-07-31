/**
 * `fudic.showRegistry` (SDD-25 §4.3).
 *
 * Dumps `tag → href → resolved`. It answers "why does my component not complete" in one
 * second, which is otherwise a question with four plausible answers — the `<link>` is
 * missing, the `href` is wrong, the file is in the wrong mode, or the index is stale.
 */

import { requireFudAndServer, type CommandDeps } from './deps.js';
import { requestFailed } from './messages.js';

export const REGISTRY_REQUEST = 'fudic/componentRegistry';

/** The shape SDD-24 §3.4 answers with. */
export interface RegistryEntry {
  readonly tag: string;
  readonly href: string;
  readonly resolved: string | null;
}

/**
 * A row is a fixed triple, not a `string[]`.
 *
 * With `noUncheckedIndexedAccess`, indexing an array yields `string | undefined` and every
 * column access grows a `?? ''` that can never happen — four dead branches in a function
 * whose whole job is to line up three columns. A tuple indexes exactly.
 */
type Row = readonly [string, string, string];
type Widths = readonly [number, number, number];

const HEADER: Row = ['tag', 'href', 'resolved'];
const UNRESOLVED = '— unresolved —';

const line = (row: Row, widths: Widths): string =>
  `${row[0].padEnd(widths[0])}  ${row[1].padEnd(widths[1])}  ${row[2]}`.trimEnd();

/** Renders the table. Pure, so the formatting is a test rather than a screenshot. */
export const renderRegistry = (entries: readonly RegistryEntry[]): string => {
  if (entries.length === 0) return 'No <link> declarations in this document.';

  const rows: Row[] = entries.map((entry) => [entry.tag, entry.href, entry.resolved ?? UNRESOLVED]);
  const widthOf = (column: 0 | 1 | 2): number =>
    Math.max(HEADER[column].length, ...rows.map((row) => row[column].length));

  const widths: Widths = [widthOf(0), widthOf(1), widthOf(2)];
  const rule: Row = ['-'.repeat(widths[0]), '-'.repeat(widths[1]), '-'.repeat(widths[2])];

  return [HEADER, rule, ...rows].map((row) => line(row, widths)).join('\n');
};

export const showRegistry = async (deps: CommandDeps): Promise<void> => {
  const target = requireFudAndServer(deps);
  if ('problem' in target) {
    deps.notifications.warn(target.problem);
    return;
  }

  let entries: readonly RegistryEntry[];
  try {
    entries = await deps.session.client.sendRequest<readonly RegistryEntry[]>(REGISTRY_REQUEST, {
      uri: target.uri,
    });
  } catch (error) {
    deps.notifications.warn(requestFailed(REGISTRY_REQUEST, error));
    return;
  }

  await deps.documents.openReadOnly('fudic-component-registry', 'plaintext', renderRegistry(entries));
};
