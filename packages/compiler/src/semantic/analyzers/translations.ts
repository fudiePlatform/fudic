/**
 * `translations` (SDD-58 §3.7): the two errors of the CODE about translating.
 *
 * - `FUD1020`: a `t()` with no literal to extract, or without the object of its holes. The
 *   same check the extraction runs, through the same collector.
 * - `FUD1021`: a pipe, `t()`, `format()` or `locale` in an app without `locales`. Only when the
 *   input SAYS the app has none: a host that cannot know stays silent.
 *
 * Errors about catalogs are `fudic translate`'s and never come from here.
 */

import { FUD1021 } from '@fudic/diagnostics';
import { child, i18nImports, isNode, unwrap, type I18nName } from '../../i18n/ast.js';
import { collectCalls } from '../../i18n/messages.js';
import { keyExpression } from '../../control/index.js';
import type { OxcNode } from '../../oxc/index.js';
import type { Node } from '../../types/index.js';
import type { Analyzer, SemanticInput } from '../model.js';
import { documentRoots, walk } from '../walk.js';

export const translations: Analyzer = {
  name: 'translations',
  run(input, report) {
    const { view, code } = fragments(input);
    // A `@code` part is registered as `module-statements`: its AST is always the list.
    const imports = i18nImports(code.flat() as readonly OxcNode[]);
    const all = [...view, ...code];
    const mapSpan = input.js.mapSpan;

    if (imports.size > 0) {
      collectCalls({ context: '', scripts: all, imports, mapSpan }).diagnostics.forEach(report);
    }

    if (input.locales !== false) return;
    const use = (node: OxcNode, what: string): void => report(FUD1021({ span: mapSpan(node.start, node.end), what }));
    for (const root of view) {
      visit(root, imports, (node, name) => use(node, name === undefined ? 'a pipe' : WHAT[name]), true);
    }
    for (const root of code) visit(root, imports, (node, name) => use(node, WHAT[name!]), false);
  },
};

const WHAT: Readonly<Record<I18nName, string>> = { t: '`t()`', format: '`format()`', locale: '`locale`' };

/** The ASTs of the view's fragments and of `@code`, apart: a pipe exists only in the first. */
function fragments(input: SemanticInput): {
  readonly view: readonly (OxcNode | readonly OxcNode[])[];
  readonly code: readonly (OxcNode | readonly OxcNode[])[];
} {
  const owners: Node[] = [];
  walk(documentRoots(input.document), {
    interpolation: (expr) => owners.push(expr),
    binding: (expr) => owners.push(expr),
    inlineCode: (node) => owners.push(node),
    render: (node) => owners.push(...node.args),
    control: (node) => {
      if (node.type === 'if') owners.push(...node.branches);
      else if (node.type === 'switch') owners.push(node, ...node.cases);
      else owners.push(node);
      if (keyExpression(node) !== undefined) owners.push(node.key!);
    },
  });
  const astOf = (owner: Node): (OxcNode | readonly OxcNode[])[] => {
    const id = input.fragmentId(owner);
    return id === undefined ? [] : [input.js.ast(id)];
  };
  return {
    view: owners.flatMap(astOf),
    code: (input.document.code?.parts ?? []).flatMap(astOf),
  };
}

/**
 * Every use under `root`: a call to `t`/`format`, a read of `locale`, and — in the view — a
 * `|`. The import that brings a name is not a use of it, nor is a property that happens to
 * share its spelling.
 */
function visit(
  root: unknown,
  imports: ReadonlyMap<string, I18nName>,
  found: (node: OxcNode, name: I18nName | undefined) => void,
  view: boolean,
): void {
  if (Array.isArray(root)) {
    for (const item of root) visit(item, imports, found, view);
    return;
  }
  if (!isNode(root) || root.type === 'ImportDeclaration') return;
  const name = (node: OxcNode | undefined): I18nName | undefined =>
    node?.type === 'Identifier' ? imports.get(String(node['name'])) : undefined;

  if (root.type === 'BinaryExpression' && root['operator'] === '|' && view) found(root, undefined);
  if (root.type === 'CallExpression') {
    const callee = name(unwrap(child(root, 'callee')!));
    if (callee === 't' || callee === 'format') found(root, callee);
  }
  if (name(root) === 'locale') found(root, 'locale');

  for (const [key, value] of Object.entries(root)) {
    // `a.locale` and `{ locale: … }` spell the name and do not read it; in `{ locale }` the
    // value is the read.
    if (key === 'property' && root.type === 'MemberExpression' && root['computed'] !== true) continue;
    if (key === 'key' && root.type === 'Property' && root['computed'] !== true) continue;
    if (typeof value === 'object') visit(value, imports, found, view);
  }
}
