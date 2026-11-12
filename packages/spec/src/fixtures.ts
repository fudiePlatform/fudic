/**
 * The names of a fixture, read off its `.fixture.ts` without running it. TS checks the values
 * through the `satisfies`; a `.fudspec` only needs the names, so that a fixture line can name
 * one.
 *
 * One reader for the three kinds. A component's fixture is a record of props: its names are the
 * keys of the `export default`. A page's or a flow's has groups — `data`, `calls`, `services`,
 * each a record by name — and `paths`, a list of values.
 */

import { FUD1510, span, type SourceDiagnostic } from '@fudic/diagnostics';
import type { ExportDefaultDeclarationKind, ObjectExpression } from 'oxc-parser';
import type { Name } from './ast.js';
import { field, isStringLiteral, keyName, objectLiteral, parseModule, properties, unwrap } from './static.js';

/** The names of one part of a fixture. */
export interface FixtureGroup {
  /** In the order written, with their spans in the fixture file. */
  readonly names: readonly Name[];
  /** Offset of the closing `}` or `]`; absent when the part is not a literal. */
  readonly end?: number;
  /**
   * Why some of it cannot be read without running it (`FUD1510`, in the fixture file): a name
   * not in `names` may still be there.
   */
  readonly problem?: SourceDiagnostic;
}

/** The groups a page's or a flow's fixture holds by name. */
export type GroupKey = 'data' | 'calls' | 'services';

export interface Fixtures {
  /** Absolute. */
  readonly path: string;
  /** The keys of the `export default`, with their spans in the fixture file: a component's fixtures. */
  readonly names: readonly Name[];
  /** Offset of the closing `}` of the default-exported object; absent when there is none. */
  readonly end?: number;
  readonly data?: FixtureGroup;
  readonly calls?: FixtureGroup;
  readonly services?: FixtureGroup;
  /** The values of `paths`. */
  readonly paths?: FixtureGroup;
}

const GROUPS: readonly GroupKey[] = ['data', 'calls', 'services'];

/**
 * Reads `export default { … }`, with or without `satisfies`/`as`, quoted keys or not. Never
 * throws: a file without that shape has no fixtures. A syntax error is TS's to report, so
 * whatever Oxc could still read is kept.
 */
export function readFixtures(source: string, path: string): Fixtures {
  const program = parseModule(path, source, 'ts').program;
  const declaration = program.body.find((s) => s.type === 'ExportDefaultDeclaration');
  const object = declaration === undefined ? undefined : objectLiteral(declaration.declaration);
  if (object === undefined) return { path, names: [] };

  const groups: Partial<Record<GroupKey | 'paths', FixtureGroup>> = {};
  for (const key of GROUPS) {
    const value = field(object, key);
    if (value !== undefined) groups[key] = record(value, key, path);
  }
  const paths = field(object, 'paths');
  if (paths !== undefined) groups.paths = list(paths, path);

  return { path, names: keysOf(object), end: object.end - 1, ...groups };
}

/** The plain keys of an object literal, with their spans. */
function keysOf(object: ObjectExpression): readonly Name[] {
  return properties(object).flatMap((property) => {
    const text = keyName(property);
    return text === undefined ? [] : [{ text, span: span(property.key.start, property.key.end) }];
  });
}

/** A group by name: an object literal with plain keys. */
function record(value: ExportDefaultDeclarationKind, key: GroupKey, path: string): FixtureGroup {
  const at = span(value.start, value.end);
  if (value.type !== 'ObjectExpression') {
    return { names: [], problem: FUD1510({ span: at, file: path, group: key, expected: 'an object literal' }) };
  }
  const names = keysOf(value);
  const end = value.end - 1;
  if (names.length === value.properties.length) return { names, end };
  return { names, end, problem: FUD1510({ span: at, file: path, group: key, expected: 'an object literal with plain keys' }) };
}

/** `paths`: an array of string literals. */
function list(value: ExportDefaultDeclarationKind, path: string): FixtureGroup {
  const problem = FUD1510({ span: span(value.start, value.end), file: path, group: 'paths', expected: 'an array of strings' });
  if (value.type !== 'ArrayExpression') return { names: [], problem };
  const names: Name[] = [];
  for (const element of value.elements) {
    const inner = element === null || element.type === 'SpreadElement' ? undefined : unwrap(element);
    if (inner !== undefined && isStringLiteral(inner)) names.push({ text: inner.value, span: span(inner.start, inner.end) });
  }
  const end = value.end - 1;
  return names.length === value.elements.length ? { names, end } : { names, end, problem };
}
