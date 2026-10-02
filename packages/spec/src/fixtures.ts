/**
 * The names of a component's fixtures, read off `<tag>.fixture.ts` without running it. TS
 * checks each fixture's values against `$Props` through the `satisfies`; a `.fudspec` only
 * needs the keys of the `export default`, so that `props <fixture>` can name one.
 */

import { span } from '@fudic/diagnostics';
import type { Name } from './ast.js';
import { keyName, objectLiteral, parseModule, properties } from './static.js';

export interface Fixtures {
  /** Absolute. */
  readonly path: string;
  /** The keys of the `export default`, with their spans in the fixture file. */
  readonly names: readonly Name[];
  /** Offset of the closing `}` of the default-exported object; absent when there is none. */
  readonly end?: number;
}

/**
 * Reads the keys of `export default { … }`, with or without `satisfies`/`as`, quoted or not.
 * Never throws: a file without that shape has no fixtures. A syntax error is TS's to report,
 * so whatever Oxc could still read is kept.
 */
export function readFixtures(source: string, path: string): Fixtures {
  const program = parseModule(path, source, 'ts').program;
  const declaration = program.body.find((s) => s.type === 'ExportDefaultDeclaration');
  const object = declaration === undefined ? undefined : objectLiteral(declaration.declaration);
  const names: Name[] = [];
  for (const property of object === undefined ? [] : properties(object)) {
    const text = keyName(property);
    if (text !== undefined) names.push({ text, span: span(property.key.start, property.key.end) });
  }
  return object === undefined ? { path, names } : { path, names, end: object.end - 1 };
}
