/**
 * A component's fixture file, written (SDD-53 §3.2): `fudic g spec` and the light bulb both
 * call these, so the file the terminal writes and the one the editor creates are the same.
 *
 * TypeScript checks every value through the `satisfies`; the `.fudspec` only reads the keys.
 *
 * `record` (SDD-82 §3.9) writes into a page's or a flow's fixture too: an entry by its name in
 * `data` or `calls`, editing the file as written instead of printing it again.
 */

import { FUD1510, span, type SourceDiagnostic } from '@fudic/diagnostics';
import { keyName, objectLiteral, parseModule, properties, unwrap } from '../static.js';
import { keyOf, objectOf, type PropField } from './shape.js';

/** One fixture entry: `<key>: { … }`, with the required props that have a sample. */
export function fixtureEntry(key: string, props: readonly PropField[]): string {
  return `${keyOf(key)}: ${objectOf(props)}`;
}

/** The whole `<tag>.fixture.ts`, one entry per key, in the order given. */
export function fixtureModule(tag: string, keys: readonly string[], props: readonly PropField[]): string {
  const entries = keys.map((key) => `  ${fixtureEntry(key, props)},\n`).join('');
  // The same shape `g component` writes: one form of fixture, whichever command wrote it.
  return (
    "import type { Fixtures } from '@fudic/terms';\n" +
    `import type { $Props } from './${tag}.fud';\n` +
    '\n' +
    `export default {\n${entries}} satisfies Fixtures<$Props>;\n`
  );
}

/** The groups `record` (SDD-82 §3.9) and the editor's light bulb (§8.2.50) write into. */
export type RecordGroup = 'data' | 'calls' | 'services';

/** One entry written into a fixture: `<group>['<name>'] = <value>`, the value already as source. */
export interface RecordedEntry {
  readonly group: RecordGroup;
  readonly name: string;
  /** Written for the indentation of an entry inside its group: four spaces. */
  readonly value: string;
}

/** What a page's or a flow's new fixture starts with: its type, and where it comes from. */
export interface FixtureKind {
  /** `Fixtures` of a page, `FlowFixtures` of a flow. */
  readonly type: string;
  /** `fudic:routes/usuarios`, or `@fudic/spec`. */
  readonly from: string;
}

/** The fixture of a page, typed by its `.fudapi`; of a flow, by `@fudic/spec`. */
export function fixtureKindOf(kind: 'page' | 'flow', route?: string): FixtureKind {
  return kind === 'page' ? { type: 'Fixtures', from: `fudic:${route as string}` } : { type: 'FlowFixtures', from: '@fudic/spec' };
}

/** What a new page fixture holds besides its empty `calls` (SDD-82 §3.10). */
export interface PageFixtureParts {
  /** One `data` entry by this name, sampled from these fields: the route declares `load`. */
  readonly data?: { readonly name: string; readonly fields: readonly PropField[] };
  /** An empty `paths`: the route declares `paths`. */
  readonly paths?: boolean;
}

/**
 * The whole `<route>.fixture.ts` of a page, typed by its `.fudapi` (`route` is its id:
 * `routes/usuarios`): a sample `data` with the shape of `LoadData`, `paths` when the route
 * declares it, and `calls` with nothing yet — every function runs for real until one is named.
 */
export function pageFixtureModule(route: string, parts: PageFixtureParts): string {
  const kind = fixtureKindOf('page', route);
  const groups = [
    ...(parts.data !== undefined ? [`  data: {\n    ${fixtureEntry(parts.data.name, parts.data.fields)},\n  },\n`] : []),
    ...(parts.paths === true ? ['  paths: [],\n'] : []),
    '  calls: {},\n',
  ];
  return `import type { ${kind.type} } from '${kind.from}';\n\nexport default {\n${groups.join('')}} satisfies ${kind.type};\n`;
}

/** The whole `<name>.fixture.ts` of a flow: `services` with nothing yet, every service the real one. */
export function flowFixtureModule(): string {
  const kind = fixtureKindOf('flow');
  return `import type { ${kind.type} } from '${kind.from}';\n\nexport default {\n  services: {},\n} satisfies ${kind.type};\n`;
}

/** A page's or a flow's fixture with nothing in it yet: what `record` writes into when there is none. */
export function emptyFixture(kind: FixtureKind): string {
  return `import type { ${kind.type} } from '${kind.from}';\n\nexport default {} satisfies ${kind.type};\n`;
}

/**
 * The fixture with `entries` written into it, each replacing what had its name (SDD-82 §3.9),
 * and the helpers they call imported from `@fudic/spec`. The rest of the file is left as it was
 * written. A file whose `export default`, or whose group, is not an object literal cannot be
 * written into: `FUD1510`, and nothing changes.
 */
export function recordFixture(
  source: string,
  path: string,
  entries: readonly RecordedEntry[],
  helpers: Iterable<string>,
): { readonly source: string } | { readonly problem: SourceDiagnostic } {
  let text = source;
  for (const entry of entries) {
    const written = writeEntry(text, path, entry);
    if (typeof written !== 'string') return { problem: written };
    text = written;
  }
  return { source: importHelpers(text, path, [...helpers]) };
}

/** The text of the line `offset` is on, up to its first non-blank. */
function indentAt(text: string, offset: number): string {
  const start = text.lastIndexOf('\n', offset - 1) + 1;
  return /^[ \t]*/u.exec(text.slice(start))![0];
}

/**
 * `item` added at the end of the object literal whose `{` is at `open` and `}` at `close`: after
 * its last property, with the comma it may lack, or alone inside an empty one.
 */
function append(text: string, open: number, close: number, item: string, indent: string): string {
  let last = close - 1;
  while (/\s/u.test(text[last]!)) last--;
  if (last === open) return `${text.slice(0, open + 1)}\n${indent}${item},\n${indentAt(text, open)}${text.slice(close)}`;
  const comma = text[last] === ',' ? '' : ',';
  return `${text.slice(0, last + 1)}${comma}\n${indent}${item},${text.slice(last + 1)}`;
}

function writeEntry(text: string, path: string, entry: RecordedEntry): string | SourceDiagnostic {
  const program = parseModule(path, text, 'ts').program;
  const declaration = program.body.find((s) => s.type === 'ExportDefaultDeclaration');
  const object = declaration === undefined ? undefined : objectLiteral(declaration.declaration);
  const at = declaration === undefined ? span(0, 0) : span(declaration.start, declaration.end);
  if (object === undefined) return FUD1510({ span: at, file: path, group: entry.group, expected: 'an export default object literal' });
  const item = `${keyOf(entry.name)}: ${entry.value}`;
  const group = properties(object).find((p) => keyName(p) === entry.group);
  if (group === undefined) {
    const inner = `${indentAt(text, object.start)}  `;
    return append(text, object.start, object.end - 1, `${entry.group}: {\n${inner}  ${item},\n${inner}}`, inner);
  }
  const value = unwrap(group.value);
  if (value.type !== 'ObjectExpression') {
    return FUD1510({ span: span(value.start, value.end), file: path, group: entry.group, expected: 'an object literal' });
  }
  const same = properties(value).find((p) => keyName(p) === entry.name);
  if (same !== undefined) return text.slice(0, same.start) + item + text.slice(same.end);
  return append(text, value.start, value.end - 1, item, `${indentAt(text, group.start)}  `);
}

/** The helpers `names` imported from `@fudic/spec`: added to its import, or a new one. */
function importHelpers(text: string, path: string, names: readonly string[]): string {
  if (names.length === 0) return text;
  const program = parseModule(path, text, 'ts').program;
  const imports = program.body.filter((s) => s.type === 'ImportDeclaration');
  const own = imports.find((s) => s.source.value === '@fudic/spec' && s.importKind !== 'type' && s.specifiers.every((x) => x.type === 'ImportSpecifier'));
  const have = new Set(own?.specifiers.map((x) => x.local.name) ?? []);
  const missing = [...new Set(names)].filter((name) => !have.has(name)).sort();
  if (missing.length === 0) return text;
  const last = own?.specifiers.at(-1);
  if (last !== undefined) return `${text.slice(0, last.end)}, ${missing.join(', ')}${text.slice(last.end)}`;
  const line = `import { ${missing.join(', ')} } from '@fudic/spec';\n`;
  const after = imports.at(-1);
  if (after === undefined) return line + text;
  const cut = text.indexOf('\n', after.end) + 1 || text.length;
  return text.slice(0, cut) + line + text.slice(cut);
}
