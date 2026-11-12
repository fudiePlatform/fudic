/**
 * Writes `src/data.generated.ts` from `web-features/data.json` (SDD-83 §4.2). Run it by hand after
 * moving `web-features` to another version, and commit what it writes:
 *
 *   pnpm --filter @fudic/baseline generate
 *
 * fudic carries the table, not the package: the `.vsix` and every build take only what the judge
 * asks, and the same fudic answers the same thing every day, because the date it judges by is the
 * data's, not the clock's.
 *
 * What it keeps:
 * - every compat key of `css`, `html`, `svg`, `mathml`, `api` and `javascript` — its features, its
 *   `newly` date and its version per core browser, each repeated status written once;
 * - every feature's name, and where a moved or split one went;
 * - each core browser's releases, for Vite's `build.target`;
 * - the indexes: CSS functions by name, CSS units, and the DOM interface of each HTML tag.
 *
 * `http.*` is left out: a browser ignores a header it does not know (§8.1, decision 13).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { UNITS } from './units.ts';

interface Release {
  readonly date: string;
  readonly version: string;
}

interface KeyData {
  readonly baseline: 'high' | 'low' | false;
  readonly baseline_low_date?: string;
  readonly support: Readonly<Record<string, string>>;
}

type Entry =
  | {
      readonly kind: 'feature';
      readonly name: string;
      readonly compat_features?: readonly string[];
      readonly status: { readonly by_compat_key?: Readonly<Record<string, KeyData>> };
    }
  | { readonly kind: 'moved'; readonly redirect_target: string }
  | { readonly kind: 'split'; readonly redirect_targets: readonly string[] };

interface Data {
  readonly browsers: Readonly<Record<string, { readonly releases: readonly Release[] }>>;
  readonly features: Readonly<Record<string, Entry>>;
}

/** The core browsers, in the order every support row is written. */
const CORE = ['chrome', 'chrome_android', 'edge', 'firefox', 'firefox_android', 'safari', 'safari_ios'] as const;

/** The browsers Vite's `build.target` names; the Android ones follow their desktop twins. */
const TARGETS = ['chrome', 'edge', 'firefox', 'safari', 'safari_ios'] as const;

const KEPT = /^(css|html|svg|mathml|api|javascript)\./u;

/**
 * The HTML interfaces whose name is not their tag's: `HTMLAnchorElement` is `<a>`. Every other
 * `api.HTML<Name>Element` whose `<name>` is an element of the data maps by itself.
 */
const IRREGULAR_TAGS: Readonly<Record<string, readonly string[]>> = {
  HTMLAnchorElement: ['a'],
  HTMLDListElement: ['dl'],
  HTMLHeadingElement: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
  HTMLImageElement: ['img'],
  HTMLModElement: ['del', 'ins'],
  HTMLOListElement: ['ol'],
  HTMLParagraphElement: ['p'],
  HTMLQuoteElement: ['blockquote', 'q'],
  HTMLTableCaptionElement: ['caption'],
  HTMLTableCellElement: ['td', 'th'],
  HTMLTableColElement: ['col', 'colgroup'],
  HTMLTableRowElement: ['tr'],
  HTMLTableSectionElement: ['tbody', 'tfoot', 'thead'],
  HTMLUListElement: ['ul'],
};

const require = createRequire(import.meta.url);
// The package exports `data.json` but not its `package.json`: the version is read beside the data.
const dataPath = require.resolve('web-features/data.json');
const version = (JSON.parse(readFileSync(new URL('package.json', pathToFileURL(dataPath)), 'utf8')) as { version: string }).version;
const data = JSON.parse(readFileSync(dataPath, 'utf8')) as Data;

// The data's date: the newest release it knows of.
const asOf = Object.values(data.browsers)
  .flatMap((browser) => browser.releases.map((release) => release.date))
  .reduce((newest, date) => (date > newest ? date : newest));

const featureIds = Object.keys(data.features).sort();
const features: [string, string][] = [];
const featureIndex = new Map<string, number>();
const redirects: [string, string[]][] = [];
for (const id of featureIds) {
  const entry = data.features[id]!;
  if (entry.kind === 'feature') {
    featureIndex.set(id, features.length);
    features.push([id, entry.name]);
  } else {
    redirects.push([id, entry.kind === 'moved' ? ['moved', entry.redirect_target] : ['split', ...entry.redirect_targets]]);
  }
}
for (const [id, [, ...to]] of redirects) {
  for (const target of to) {
    if (!featureIndex.has(target!)) throw new Error(`${id} redirects to ${target}, which is not a feature`);
  }
}

// Each key with its features (a few keys belong to two: `audio` and `video` share HTMLMediaElement).
const keyFeatures = new Map<string, number[]>();
const keyData = new Map<string, KeyData>();
for (const id of featureIds) {
  const entry = data.features[id]!;
  if (entry.kind !== 'feature') continue;
  for (const key of entry.compat_features ?? []) {
    if (!KEPT.test(key)) continue;
    const status = entry.status.by_compat_key?.[key];
    if (status === undefined) throw new Error(`${key} of ${id} has no status`);
    keyFeatures.set(key, [...(keyFeatures.get(key) ?? []), featureIndex.get(id)!]);
    keyData.set(key, status);
  }
}

const supports: string[] = [];
const supportIndex = new Map<string, number>();
const statuses: string[] = [];
const statusIndex = new Map<string, number>();
const groups = new Map<string, [string, number][]>();
for (const key of [...keyData.keys()].sort()) {
  const status = keyData.get(key)!;
  const support = CORE.map((browser) => status.support[browser] ?? '-').join(' ');
  if (!supportIndex.has(support)) {
    supportIndex.set(support, supports.length);
    supports.push(support);
  }
  const own = keyFeatures.get(key)!;
  const newly = status.baseline === false ? null : status.baseline_low_date!;
  const row = JSON.stringify([own.length === 1 ? own[0] : own, newly, supportIndex.get(support)]);
  if (!statusIndex.has(row)) {
    statusIndex.set(row, statuses.length);
    statuses.push(row);
  }
  const at = key.lastIndexOf('.');
  const parent = key.slice(0, at);
  groups.set(parent, [...(groups.get(parent) ?? []), [key.slice(at + 1), statusIndex.get(row)!]]);
}

// CSS functions, by the last segment of `css.types.*`: `light-dark` is `css.types.color.light-dark`.
const functions = new Map<string, string[]>();
for (const key of keyData.keys()) {
  if (!key.startsWith('css.types.')) continue;
  const name = key.slice(key.lastIndexOf('.') + 1);
  functions.set(name, [...(functions.get(name) ?? []), key]);
}

// The DOM interface of each HTML tag, for the receiver of an event: `<div>` is `HTMLDivElement`.
const tags = new Map<string, string>();
for (const key of keyData.keys()) {
  const match = /^api\.(HTML(\w+)Element)$/u.exec(key);
  if (match === null) continue;
  const [, name, stem] = match as unknown as [string, string, string];
  for (const tag of IRREGULAR_TAGS[name] ?? [stem.toLowerCase()]) {
    if (keyData.has(`html.elements.${tag}`)) tags.set(tag, name);
  }
}
for (const [name, list] of Object.entries(IRREGULAR_TAGS)) {
  for (const tag of list) {
    if (tags.get(tag) !== name) throw new Error(`<${tag}> did not map to ${name}`);
  }
}
for (const [unit, key] of Object.entries(UNITS)) {
  if (!keyData.has(key)) throw new Error(`the unit ${unit} names ${key}, which is not in the data`);
}

// The table is written inside a template literal: nothing in it may end it or interpolate.
for (const text of [...keyData.keys(), ...supports]) {
  if (/[`\\$]/u.test(text)) throw new Error(`${text} cannot be written inside the table`);
}

const releases = TARGETS.map(
  (browser) =>
    `  ${browser}: [${data.browsers[browser]!.releases.map((r) => `[${JSON.stringify(r.version)}, '${r.date}']`).join(', ')}],`,
);

const q = (s: string): string => JSON.stringify(s);
const sorted = <T>(map: Map<string, T>): [string, T][] => [...map].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

const out = `// Generated by scripts/generate.ts from web-features ${version}: do not edit by hand.
// Run \`pnpm --filter @fudic/baseline generate\` after moving web-features to another version.

/** The version of web-features this table was written from. */
export const VERSION = ${q(version)};

/** The data's date: the newest browser release it knows of. */
export const AS_OF = '${asOf}';

/** The core browsers, in the order of every support row of \`TABLE\`. */
export const CORE = ${JSON.stringify(CORE)} as const;

/** The releases of the browsers Vite targets: \`[version, date]\`, oldest first. */
export const RELEASES: Readonly<Record<'chrome' | 'edge' | 'firefox' | 'safari' | 'safari_ios', readonly (readonly [string, string])[]>> = {
${releases.join('\n')}
};

/** Every feature: \`[id, name]\`, by id. A status points into this list. */
export const FEATURES: readonly (readonly [string, string])[] = [
${features.map(([id, name]) => `  [${q(id)}, ${q(name)}],`).join('\n')}
];

/** The ids that are no longer features: \`['moved', to]\` or \`['split', ...to]\`. */
export const REDIRECTS: Readonly<Record<string, readonly string[]>> = {
${redirects.map(([id, to]) => `  ${q(id)}: ${JSON.stringify(to)},`).join('\n')}
};

/** The key of each CSS unit, lowercase (\`scripts/units.ts\`). */
export const CSS_UNITS: Readonly<Record<string, string>> = {
${sorted(new Map(Object.entries(UNITS)))
  .map(([unit, key]) => `  ${q(unit)}: ${q(key)},`)
  .join('\n')}
};

/** The DOM interface of each HTML tag that has one of its own; any other is \`HTMLElement\`. */
export const TAG_INTERFACES: Readonly<Record<string, string>> = {
${sorted(tags)
  .map(([tag, name]) => `  ${q(tag)}: ${q(name)},`)
  .join('\n')}
};
`;

const table = `// Generated by scripts/generate.ts from web-features ${version}: do not edit by hand.
// Run \`pnpm --filter @fudic/baseline generate\` after moving web-features to another version.

/**
 * Every key with its status, and the CSS functions, as JSON TEXT that the judge parses the first time
 * it is asked. Its own module, so what only reads a \`fudic.json\` never loads it; and text, not object
 * literals, which cost every process that loaded them 40 ms whether it judged anything or not.
 *
 * - \`support\`: each distinct row of first versions, in \`CORE\` order, \`-\` for none.
 * - \`status\`: each distinct \`[feature or features, newly date or null, support row]\`.
 * - \`keys\`: every key by its parent and its last segment: \`keys['api.HTMLElement'].showPopover\` is a status.
 * - \`functions\`: the keys of each CSS function or type by its name, the last segment of \`css.types.*\`.
 */
export const TABLE = \`{
"support": [
${supports.map((row) => q(row)).join(',\n')}
],
"status": [
${statuses.join(',\n')}
],
"keys": {
${sorted(groups)
  .map(([parent, leaves]) => `${q(parent)}: { ${leaves.map(([leaf, at]) => `${q(leaf)}: ${at}`).join(', ')} }`)
  .join(',\n')}
},
"functions": {
${sorted(functions)
  .map(([name, keys]) => `${q(name)}: ${JSON.stringify(keys.sort())}`)
  .join(',\n')}
}
}\`;
`;

writeFileSync(new URL('../src/data.generated.ts', import.meta.url), out);
writeFileSync(new URL('../src/table.generated.ts', import.meta.url), table);
console.log(`web-features ${version}: ${keyData.size} keys, ${features.length} features, as of ${asOf}`);
